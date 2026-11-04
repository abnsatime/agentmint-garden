import type { GardenMintRow, MarketEventRow, NftTransferRow } from "../db/schema.js";
import {
  decodeGardenMint,
  decodeMarketEvent,
  decodeTransfer,
  type RawLog,
} from "./events.js";
import type { TimestampLookup } from "./timestamps.js";

/**
 * Pure row builders: raw logs plus a timestamp lookup in, insertable rows out. Keeping this
 * separate from the database and the RPC is what makes the sync loop testable.
 */

export interface PendingEvents {
  mints: GardenMintRow[];
  transfers: NftTransferRow[];
  market: MarketEventRow[];
}

export function emptyPending(): PendingEvents {
  return { mints: [], transfers: [], market: [] };
}

export function countPending(events: PendingEvents): number {
  return events.mints.length + events.transfers.length + events.market.length;
}

/** The garden stream carries both `GardenMinted` and `Transfer`; dispatch on the topic. */
export function collectGardenRows(logs: readonly RawLog[], at: TimestampLookup): PendingEvents {
  const events = emptyPending();

  for (const log of logs) {
    const mint = decodeGardenMint(log);
    if (mint) {
      events.mints.push({
        tokenId: mint.tokenId,
        minter: mint.minter,
        freeMint: mint.freeMint,
        pricePaidWei: mint.pricePaidWei.toString(),
        blockNumber: mint.blockNumber,
        logIndex: mint.logIndex,
        txHash: mint.txHash,
        blockTime: at(mint.blockNumber),
      });
      continue;
    }

    const transfer = decodeTransfer(log);
    if (transfer) {
      events.transfers.push({
        tokenId: transfer.tokenId,
        fromAddress: transfer.from,
        toAddress: transfer.to,
        blockNumber: transfer.blockNumber,
        logIndex: transfer.logIndex,
        txHash: transfer.txHash,
        blockTime: at(transfer.blockNumber),
      });
    }
  }

  return events;
}

export function collectMarketRows(
  logs: readonly RawLog[],
  at: TimestampLookup,
): PendingEvents {
  const events = emptyPending();

  for (const log of logs) {
    const market = decodeMarketEvent(log);
    if (!market) continue;
    events.market.push({
      kind: market.kind,
      tokenId: market.tokenId,
      seller: market.seller,
      buyer: market.buyer ?? null,
      priceWei: market.priceWei === undefined ? null : market.priceWei.toString(),
      blockNumber: market.blockNumber,
      logIndex: market.logIndex,
      txHash: market.txHash,
      blockTime: at(market.blockNumber),
    });
  }

  return events;
}
