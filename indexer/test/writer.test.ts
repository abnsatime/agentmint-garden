import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client.js";
import { gardenMints, marketEvents, nftTransfers, syncCursors } from "../src/db/schema.js";
import { readCursor } from "../src/sync/cursor.js";
import { commitWindow } from "../src/sync/writer.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

const MINTER = "0xF040275C3e38Cb018C491BC8A5A5437D86178A67";
const AT = new Date("2026-11-04T00:00:00.000Z");
const KEY = { chainId: 97, stream: "garden" } as const;

describeDb("commitWindow", () => {
  const { db, pool } = createDb(databaseUrl as string);

  const mint = {
    tokenId: 7n,
    minter: MINTER,
    freeMint: true,
    pricePaidWei: "0",
    blockNumber: 100n,
    logIndex: 0,
    txHash: "0xaa",
    blockTime: AT,
  };

  const transfer = {
    tokenId: 7n,
    fromAddress: "0x0000000000000000000000000000000000000000",
    toAddress: MINTER,
    blockNumber: 100n,
    logIndex: 1,
    txHash: "0xaa",
    blockTime: AT,
  };

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

  it("writes the rows and moves the cursor", async () => {
    const result = await commitWindow(db, {
      ...KEY,
      lastBlock: 149n,
      events: { mints: [mint], transfers: [transfer], market: [] },
    });

    expect(result.inserted).toEqual({ mints: 1, transfers: 1, market: 0 });
    expect(result.cursor.lastBlock).toBe(149n);
    expect(await db.select().from(gardenMints)).toHaveLength(1);
    expect((await readCursor(db, KEY))?.lastBlock).toBe(149n);
  });

  it("is idempotent: replaying a window inserts nothing and keeps the cursor", async () => {
    await commitWindow(db, { ...KEY, lastBlock: 149n, events: { mints: [mint], transfers: [transfer], market: [] } });

    const again = await commitWindow(db, {
      ...KEY,
      lastBlock: 149n,
      events: { mints: [mint], transfers: [transfer], market: [] },
    });

    expect(again.inserted).toEqual({ mints: 0, transfers: 0, market: 0 });
    expect(again.cursor.lastBlock).toBe(149n);
    expect(await db.select().from(gardenMints)).toHaveLength(1);
  });

  it("creates the cursor on the first window", async () => {
    expect(await readCursor(db, KEY)).toBeNull();
    await commitWindow(db, { ...KEY, lastBlock: 10n, events: { mints: [mint], transfers: [], market: [] } });
    expect(await readCursor(db, KEY)).toMatchObject({ lastBlock: 10n });
  });

  it("leaves the cursor untouched when the write fails", async () => {
    const broken = { ...mint, minter: null as unknown as string };

    await expect(
      commitWindow(db, {
        ...KEY,
        lastBlock: 149n,
        events: { mints: [broken], transfers: [], market: [] },
      }),
    ).rejects.toThrow();

    expect(await readCursor(db, KEY)).toBeNull();
    expect(await db.select().from(gardenMints)).toHaveLength(0);
  });

  it("keeps streams apart", async () => {
    await commitWindow(db, { ...KEY, lastBlock: 149n, events: { mints: [mint], transfers: [], market: [] } });
    await commitWindow(db, {
      chainId: 97,
      stream: "market",
      lastBlock: 9n,
      events: {
        mints: [],
        transfers: [],
        market: [
          {
            kind: "listed",
            tokenId: 7n,
            seller: MINTER,
            buyer: null,
            priceWei: "1538",
            blockNumber: 5n,
            logIndex: 0,
            txHash: "0xbb",
            blockTime: AT,
          },
        ],
      },
    });

    expect((await readCursor(db, KEY))?.lastBlock).toBe(149n);
    expect((await readCursor(db, { chainId: 97, stream: "market" }))?.lastBlock).toBe(9n);
    expect(await db.select().from(marketEvents)).toHaveLength(1);
  });
});
