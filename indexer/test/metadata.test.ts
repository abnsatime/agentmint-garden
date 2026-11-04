import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ChainReader } from "../src/chain/reader.js";
import { createDb } from "../src/db/client.js";
import { gardenMints, tokenMetadata } from "../src/db/schema.js";
import { syncTokenMetadata } from "../src/sync/metadata.js";
import type { RawLog } from "../src/sync/events.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

const GARDEN = "0x5bEd1F9d23FaFdE1A4b81215a2888812494d4107";
const MINTER = "0xF040275C3e38Cb018C491BC8A5A5437D86178A67";
const AT = new Date("2026-11-04T00:00:00.000Z");

function dataUri(document: unknown): string {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(document)).toString("base64")}`;
}

function fakeReader(uris: Map<bigint, string>): ChainReader & { calls: bigint[] } {
  const calls: bigint[] = [];
  return {
    calls,
    head: async () => 0n,
    logs: async () => [] as RawLog[],
    timestamp: async () => 0n,
    tokenUri: async (_address, tokenId) => {
      calls.push(tokenId);
      const uri = uris.get(tokenId);
      if (!uri) throw new Error(`no uri for ${tokenId}`);
      return uri;
    },
  };
}

function mintRow(tokenId: bigint) {
  return {
    tokenId,
    minter: MINTER,
    freeMint: true,
    pricePaidWei: "0",
    blockNumber: 100n,
    logIndex: 0,
    txHash: `0x${tokenId.toString(16).padStart(4, "0")}`,
    blockTime: AT,
  };
}

describeDb("token metadata", () => {
  const { db, pool } = createDb(databaseUrl as string);

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  beforeEach(async () => {
    await db.delete(tokenMetadata);
    await db.delete(gardenMints);
  });

  afterAll(async () => {
    await db.delete(tokenMetadata);
    await db.delete(gardenMints);
    await pool.end();
  });

  it("reads and stores the artwork of minted tokens", async () => {
    await db.insert(gardenMints).values([mintRow(1n), mintRow(2n)]);
    const reader = fakeReader(
      new Map([
        [1n, dataUri({ name: "Garden #1", image: "data:image/svg+xml;base64,AAA", attributes: [{ trait_type: "hue", value: "10" }] })],
        [2n, dataUri({ name: "Garden #2" })],
      ]),
    );

    const report = await syncTokenMetadata({ db, reader, gardenAddress: GARDEN }, 10);

    expect(report).toEqual({ attempted: 2, stored: 2, failed: 0 });
    const stored = await db.select().from(tokenMetadata);
    expect(stored).toHaveLength(2);
    expect(stored.find((row) => row.tokenId === 1n)).toMatchObject({
      name: "Garden #1",
      image: "data:image/svg+xml;base64,AAA",
      traits: [{ trait_type: "hue", value: "10" }],
    });
  });

  it("only fetches what is missing", async () => {
    await db.insert(gardenMints).values([mintRow(1n), mintRow(2n)]);
    const reader = fakeReader(
      new Map([
        [1n, dataUri({ name: "Garden #1" })],
        [2n, dataUri({ name: "Garden #2" })],
      ]),
    );

    await syncTokenMetadata({ db, reader, gardenAddress: GARDEN }, 10);
    const second = await syncTokenMetadata({ db, reader, gardenAddress: GARDEN }, 10);

    expect(second).toEqual({ attempted: 0, stored: 0, failed: 0 });
    expect(reader.calls).toHaveLength(2);
  });

  it("leaves a token pending when its uri cannot be read", async () => {
    await db.insert(gardenMints).values([mintRow(3n)]);
    const reader = fakeReader(new Map());

    const report = await syncTokenMetadata({ db, reader, gardenAddress: GARDEN }, 10);

    expect(report).toEqual({ attempted: 1, stored: 0, failed: 1 });
    expect(await db.select().from(tokenMetadata)).toHaveLength(0);
  });

  it("respects the per-run limit", async () => {
    await db.insert(gardenMints).values([mintRow(1n), mintRow(2n), mintRow(3n)]);
    const reader = fakeReader(
      new Map([
        [1n, dataUri({ name: "Garden #1" })],
        [2n, dataUri({ name: "Garden #2" })],
        [3n, dataUri({ name: "Garden #3" })],
      ]),
    );

    const report = await syncTokenMetadata({ db, reader, gardenAddress: GARDEN }, 2);

    expect(report.attempted).toBe(2);
    // Newest first, so the fresh mint is the one that gets artwork.
    expect(reader.calls.sort()).toEqual([2n, 3n]);
  });
});
