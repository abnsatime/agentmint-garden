import type { Database } from "../db/client.js";
import { gardenMints, marketEvents, nftTransfers } from "../db/schema.js";
import { advanceCursor, type Cursor } from "./cursor.js";
import type { PendingEvents } from "./rows.js";

export interface CommitParams {
  chainId: number;
  stream: string;
  /** The last block covered by this batch; the cursor moves here. */
  lastBlock: bigint;
  events: PendingEvents;
}

export interface CommitResult {
  cursor: Cursor;
  inserted: { mints: number; transfers: number; market: number };
}

/**
 * Writes a batch and moves the cursor in one transaction.
 *
 * The ordering is the point: if the insert fails, the cursor stays where it was and the same
 * window is retried; if the commit succeeds, the rows and the cursor move together, so a
 * restart never resumes past a block whose logs were not stored.
 *
 * Inserts ignore conflicts, which makes a replayed window (same transaction hash and log index)
 * a no-op instead of an error.
 */
export async function commitWindow(db: Database, params: CommitParams): Promise<CommitResult> {
  const { events } = params;

  return db.transaction(async (tx) => {
    const mints = events.mints.length
      ? await tx
          .insert(gardenMints)
          .values(events.mints)
          .onConflictDoNothing()
          .returning({ tokenId: gardenMints.tokenId })
      : [];

    const transfers = events.transfers.length
      ? await tx
          .insert(nftTransfers)
          .values(events.transfers)
          .onConflictDoNothing()
          .returning({ id: nftTransfers.id })
      : [];

    const market = events.market.length
      ? await tx
          .insert(marketEvents)
          .values(events.market)
          .onConflictDoNothing()
          .returning({ id: marketEvents.id })
      : [];

    const cursor = await advanceCursor(
      tx,
      { chainId: params.chainId, stream: params.stream },
      params.lastBlock,
    );

    return {
      cursor,
      inserted: {
        mints: mints.length,
        transfers: transfers.length,
        market: market.length,
      },
    };
  });
}
