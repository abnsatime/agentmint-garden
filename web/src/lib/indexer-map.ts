import type { Address } from "viem";
import type { GalleryItem, GalleryMintEvent } from "./use-gallery";
import type { ActivityItem, Holding } from "./my-garden";
import type { IndexActivity, IndexListing, IndexToken } from "./indexer";
import type { MarketItem } from "./use-market";

/**
 * Index payloads to the shapes the components already use. Pure, so the mapping is tested
 * without a browser, a chain or a server.
 */

export function toSeconds(iso: string | null | undefined): number | undefined {
  if (!iso) return undefined;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? Math.round(parsed / 1000) : undefined;
}

export function toGalleryItem(token: IndexToken): GalleryItem {
  const tokenId = Number(token.tokenId);
  return {
    tokenId,
    owner: token.owner as Address,
    name: token.metadata?.name ?? `GARDEN #${tokenId}`,
    image: token.metadata?.image ?? undefined,
    hue: token.metadata?.traits?.[0]?.value,
  };
}

export function toGalleryMint(token: IndexToken): GalleryMintEvent | null {
  if (!token.mintedBy) return null;
  return {
    tokenId: Number(token.tokenId),
    minter: token.mintedBy as Address,
    freeMint: token.freeMint ?? false,
    pricePaid: BigInt(token.pricePaidWei ?? "0"),
    blockNumber: 0,
    transactionHash: token.mintedTxHash ?? "",
    timestamp: toSeconds(token.mintedAt) ?? 0,
  };
}

export function toMarketItem(listing: IndexListing): MarketItem {
  const tokenId = Number(listing.tokenId);
  return {
    tokenId,
    seller: listing.seller as Address,
    price: BigInt(listing.priceWei),
    sinceBlock: Number(listing.sinceBlock),
    name: listing.metadata?.name ?? `GARDEN #${tokenId}`,
    image: listing.metadata?.image ?? undefined,
    traits: listing.metadata?.traits ?? [],
  };
}

const ZERO = "0x0000000000000000000000000000000000000000";

export function toActivityItem(entry: IndexActivity): ActivityItem {
  const inbound = entry.direction === "in";
  const isMint = inbound && entry.counterparty.toLowerCase() === ZERO;
  return {
    kind: isMint ? "mint" : entry.direction,
    tokenId: Number(entry.tokenId),
    counterparty: entry.counterparty as Address,
    blockNumber: Number(entry.blockNumber),
    logIndex: entry.logIndex,
    transactionHash: entry.txHash,
    timestamp: toSeconds(entry.blockTime),
    ...(isMint
      ? {
          freeMint: entry.freeMint ?? undefined,
          pricePaid: entry.pricePaidWei === null ? undefined : BigInt(entry.pricePaidWei),
        }
      : {}),
  };
}

/**
 * Holdings come from the owned tokens, and how each one arrived comes from the activity list:
 * the newest inbound transfer for that token is the acquisition.
 */
export function toHoldings(
  tokens: readonly IndexToken[],
  activity: readonly IndexActivity[],
): Array<Holding & { acquiredAt?: number }> {
  const latest = new Map<
    number,
    { blockNumber: number; txHash: string; from: string; timestamp?: number }
  >();

  for (const entry of activity) {
    if (entry.direction !== "in") continue;
    const tokenId = Number(entry.tokenId);
    const blockNumber = Number(entry.blockNumber);
    const current = latest.get(tokenId);
    if (!current || blockNumber >= current.blockNumber) {
      latest.set(tokenId, {
        blockNumber,
        txHash: entry.txHash,
        from: entry.counterparty,
        timestamp: toSeconds(entry.blockTime),
      });
    }
  }

  return tokens.map((token) => {
    const tokenId = Number(token.tokenId);
    const arrived = latest.get(tokenId);
    const from = (arrived?.from ?? ZERO) as Address;
    return {
      tokenId,
      acquiredTx: arrived?.txHash ?? "",
      acquiredBlock: arrived?.blockNumber ?? 0,
      from,
      mintedHere: Boolean(token.mintedBy) && token.mintedBy?.toLowerCase() === token.owner.toLowerCase(),
      acquiredAt: arrived?.timestamp,
    };
  });
}
