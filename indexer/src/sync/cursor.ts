import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import { syncCursors } from "../db/schema.js";
import { shouldAdvance } from "./ranges.js";

/**
 * The cursor is the indexer's memory: one row per (chain, stream) holding the last block whose
 * logs have been committed. Writes only ever move forward, in the same transaction as the rows
 * they describe, so a crash mid-batch cannot skip a block.
 */

export interface CursorKey {
  chainId: number;
  stream: string;
}

export interface Cursor {
  chainId: number;
  stream: string;
  lastBlock: bigint;
  updatedAt: Date;
}

export async function readCursor(db: Database, key: CursorKey): Promise<Cursor | null> {
  const rows = await db
    .select()
    .from(syncCursors)
    .where(and(eq(syncCursors.chainId, key.chainId), eq(syncCursors.stream, key.stream)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    chainId: row.chainId,
    stream: row.stream,
    lastBlock: row.lastBlock,
    updatedAt: row.updatedAt,
  };
}

/**
 * Moves the cursor to `lastBlock`, creating it if needed. A lower value is ignored, so a
 * retried batch can never rewind the stream.
 */
export async function advanceCursor(
  db: Database,
  key: CursorKey,
  lastBlock: bigint,
): Promise<Cursor> {
  const current = await readCursor(db, key);
  if (!shouldAdvance(current?.lastBlock, lastBlock)) {
    if (current) return current;
    throw new Error("cannot advance a cursor that does not exist to a negative block");
  }

  const rows = await db
    .insert(syncCursors)
    .values({ chainId: key.chainId, stream: key.stream, lastBlock })
    .onConflictDoUpdate({
      target: [syncCursors.chainId, syncCursors.stream],
      set: {
        lastBlock: sql`greatest(${syncCursors.lastBlock}, ${lastBlock})`,
        updatedAt: sql`now()`,
      },
    })
    .returning();

  const row = rows[0];
  if (!row) throw new Error("cursor upsert returned no row");
  return {
    chainId: row.chainId,
    stream: row.stream,
    lastBlock: row.lastBlock,
    updatedAt: row.updatedAt,
  };
}

export async function listCursors(db: Database, chainId?: number): Promise<Cursor[]> {
  const rows = await (chainId === undefined
    ? db.select().from(syncCursors)
    : db.select().from(syncCursors).where(eq(syncCursors.chainId, chainId)));

  return rows.map((row) => ({
    chainId: row.chainId,
    stream: row.stream,
    lastBlock: row.lastBlock,
    updatedAt: row.updatedAt,
  }));
}
