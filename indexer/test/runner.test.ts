import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ChainReader } from "../src/chain/reader.js";
import { createDb } from "../src/db/client.js";
import {
  gardenMints,
  marketEvents,
  nftTransfers,
  syncCursors,
} from "../src/db/schema.js";
import type { Config } from "../src/env.js";
import { readCursor } from "../src/sync/cursor.js";
import { GARDEN_MINTED_TOPIC, MARKET_TOPICS, type RawLog } from "../src/sync/events.js";
import { SyncRunner } from "../src/sync/runner.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

const GARDEN = "0x5bEd1F9d23FaFdE1A4b81215a2888812494d4107";
const MARKET = "0x153bbf8fc8eD31ab8e73d9b5AE3076d73d3424e2";
const MINTER = "0xF040275C3e38Cb018C491BC8A5A5437D86178A67";

function word(value: bigint | number) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function topicOf(address: string) {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function rawLog(topics: string[], data: string, block: bigint, logIndex = 0): RawLog {
  return {
    topics,
    data,
    blockNumber: `0x${block.toString(16)}`,
    transactionHash: `0x${"ab".repeat(32)}`,
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

const MINT_AT_950 = rawLog(
  [GARDEN_MINTED_TOPIC, topicOf(MINTER), `0x${word(7)}`],
  `0x${word(1)}${word(0)}`,
  950n,
);
const LISTED_AT_960 = rawLog(
  [MARKET_TOPICS.listed, `0x${word(7)}`, topicOf(MINTER)],
  `0x${word(1_500_000_000_000_000n)}`,
  960n,
);

interface FakeReader extends ChainReader {
  calls: Array<{ address: string; fromBlock: bigint; toBlock: bigint }>;
}

function fakeReader(options: { head: bigint; failFor?: string }): FakeReader {
  const calls: FakeReader["calls"] = [];

  return {
    calls,
    head: async () => options.head,
    logs: async ({ address, fromBlock, toBlock }) => {
      calls.push({ address, fromBlock, toBlock });
      if (options.failFor && address.toLowerCase() === options.failFor.toLowerCase()) {
        throw new Error("rpc boom");
      }
      const inside = (block: bigint) => block >= fromBlock && block <= toBlock;
      if (address.toLowerCase() === GARDEN.toLowerCase()) return inside(950n) ? [MINT_AT_950] : [];
      if (address.toLowerCase() === MARKET.toLowerCase()) return inside(960n) ? [LISTED_AT_960] : [];
      return [];
    },
    timestamp: async (block) => 1_700_000_000n + block,
  };
}

const config = {
  chainId: 97,
  logWindowBlocks: 50n,
  garden: { address: GARDEN, deployBlock: 900n },
  market: { address: MARKET, deployBlock: 950n },
} as unknown as Config;

describeDb("SyncRunner", () => {
  const { db, pool } = createDb(databaseUrl as string);

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  beforeEach(async () => {
    await db.delete(gardenMints);
    await db.delete(nftTransfers);
    await db.delete(marketEvents);
    await db.delete(syncCursors);
  });

  afterAll(async () => {
    await db.delete(gardenMints);
    await db.delete(nftTransfers);
    await db.delete(marketEvents);
    await db.delete(syncCursors);
    await pool.end();
  });

  it("scans both streams window by window up to the head", async () => {
    const reader = fakeReader({ head: 1_000n });
    const runner = new SyncRunner({ db, reader, config });

    const report = await runner.advanceOnce();

    const garden = report.streams.find((stream) => stream.stream === "garden");
    const market = report.streams.find((stream) => stream.stream === "market");

    // garden starts at 900 with 50-block windows: 900-949, 950-999, 1000.
    expect(garden).toMatchObject({ fromBlock: 900n, toBlock: 1_000n, windows: 3, inserted: 1, more: false });
    // market starts at 950: 950-999, 1000.
    expect(market).toMatchObject({ fromBlock: 950n, toBlock: 1_000n, windows: 2, inserted: 1, more: false });

    expect(await readCursor(db, { chainId: 97, stream: "garden" })).toMatchObject({ lastBlock: 1_000n });
    expect(await readCursor(db, { chainId: 97, stream: "market" })).toMatchObject({ lastBlock: 1_000n });
    expect(await db.select().from(gardenMints)).toHaveLength(1);
    expect(await db.select().from(marketEvents)).toHaveLength(1);
  });

  it("stamps rows with the block time from the chain", async () => {
    const runner = new SyncRunner({ db, reader: fakeReader({ head: 1_000n }), config });
    await runner.advanceOnce();

    const mints = await db.select().from(gardenMints);
    expect(mints[0]?.blockTime).toEqual(new Date(1_700_000_950_000));
  });

  it("does nothing on a second run at the same head", async () => {
    const runner = new SyncRunner({ db, reader: fakeReader({ head: 1_000n }), config });
    await runner.advanceOnce();

    const second = await new SyncRunner({ db, reader: fakeReader({ head: 1_000n }), config }).advanceOnce();

    expect(second.streams.every((stream) => stream.windows === 0 && stream.inserted === 0)).toBe(true);
    expect(await db.select().from(gardenMints)).toHaveLength(1);
  });

  it("stops at the window cap and says there is more", async () => {
    const runner = new SyncRunner({
      db,
      reader: fakeReader({ head: 1_000n }),
      config,
      maxWindowsPerStream: 1,
    });

    const report = await runner.advanceOnce();
    const garden = report.streams.find((stream) => stream.stream === "garden");

    expect(garden).toMatchObject({ windows: 1, toBlock: 949n, more: true });
    expect(await readCursor(db, { chainId: 97, stream: "garden" })).toMatchObject({ lastBlock: 949n });
  });

  it("keeps the failed stream's cursor when the RPC throws mid-run", async () => {
    const runner = new SyncRunner({
      db,
      reader: fakeReader({ head: 1_000n, failFor: MARKET }),
      config,
    });

    await expect(runner.advanceOnce()).rejects.toThrow(/rpc boom/);

    // The garden stream completed before the market stream failed.
    expect(await readCursor(db, { chainId: 97, stream: "garden" })).toMatchObject({ lastBlock: 1_000n });
    expect(await readCursor(db, { chainId: 97, stream: "market" })).toBeNull();

    const status = await runner.status();
    expect(status.lastError).toContain("rpc boom");
    expect(status.streams.find((entry) => entry.stream === "garden")?.started).toBe(true);
    expect(status.streams.find((entry) => entry.stream === "market")?.started).toBe(false);
  });

  it("reports progress through the injected callback", async () => {
    const messages: string[] = [];
    const runner = new SyncRunner({
      db,
      reader: fakeReader({ head: 1_000n }),
      config,
      onProgress: (message) => messages.push(message),
    });

    await runner.advanceOnce();

    expect(messages.length).toBe(5);
    expect(messages[0]).toContain("garden: 900-949");
  });
});
