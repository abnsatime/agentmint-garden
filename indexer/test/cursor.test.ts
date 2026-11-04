import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "../src/db/client.js";
import { syncCursors } from "../src/db/schema.js";
import { advanceCursor, listCursors, readCursor } from "../src/sync/cursor.js";

/**
 * These run only when DATABASE_URL points at a database the tests may write to. Without it the
 * suite skips, so a checkout without Postgres still gives a green run.
 */
const databaseUrl = process.env.DATABASE_URL;
const describeDb = databaseUrl ? describe : describe.skip;

describeDb("cursor store", () => {
  const { db, pool } = createDb(databaseUrl as string);
  const key = { chainId: 97, stream: "test-garden" } as const;
  const otherKey = { chainId: 97, stream: "test-market" } as const;

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
  });

  beforeEach(async () => {
    await db.delete(syncCursors);
  });

  afterAll(async () => {
    await db.delete(syncCursors);
    await pool.end();
  });

  it("returns null before the stream exists", async () => {
    expect(await readCursor(db, key)).toBeNull();
  });

  it("creates the cursor on first advance", async () => {
    const cursor = await advanceCursor(db, key, 140_503_064n);
    expect(cursor.chainId).toBe(97);
    expect(cursor.lastBlock).toBe(140_503_064n);
    expect(await readCursor(db, key)).toMatchObject({ lastBlock: 140_503_064n });
  });

  it("moves forward", async () => {
    await advanceCursor(db, key, 100n);
    const cursor = await advanceCursor(db, key, 200n);
    expect(cursor.lastBlock).toBe(200n);
  });

  it("ignores a rewind, so a retried batch cannot rescan the chain", async () => {
    await advanceCursor(db, key, 200n);
    const cursor = await advanceCursor(db, key, 150n);
    expect(cursor.lastBlock).toBe(200n);
    expect((await readCursor(db, key))?.lastBlock).toBe(200n);
  });

  it("keeps streams independent", async () => {
    await advanceCursor(db, otherKey, 500n);
    await advanceCursor(db, key, 100n);

    const streams = await listCursors(db, 97);
    expect(streams.find((entry) => entry.stream === otherKey.stream)?.lastBlock).toBe(500n);
    expect(streams.find((entry) => entry.stream === key.stream)?.lastBlock).toBe(100n);
  });
});
