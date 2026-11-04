"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { agentMintGardenAbi, gardenAddress } from "./contracts";
import { collectLogs, logClient, stateClient } from "./log-client";
import { mapLimit } from "./gallery";
import { decodeTokenUri } from "./mint";
import {
  MARKET_TOPIC_LIST,
  decodeMarketEvent,
  deriveListings,
  sortListings,
  type Listing,
  type MarketEvent,
} from "./market";
import { MARKET_DEPLOYMENT_BLOCK, marketAddress } from "./market-contracts";

export interface MarketItem extends Listing {
  name: string;
  image?: string;
  traits: Array<{ trait_type: string; value: string }>;
}

export interface MarketState {
  status: "loading" | "ready" | "error";
  error: string | null;
  items: MarketItem[];
  staleCount: number;
  refresh: () => void;
}

function describe(error: unknown) {
  return ((error as Error)?.message ?? "Could not read the market.").split("\n")[0];
}

/**
 * Rebuilds the order book from market events, then drops listings whose seller no longer owns
 * the token (the contract rejects those, so showing them would only invite failed purchases).
 */
export function useMarket(pageSize = 48): MarketState {
  const [status, setStatus] = useState<MarketState["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MarketItem[]>([]);
  const [staleCount, setStaleCount] = useState(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setStatus("loading");
      setError(null);
      try {
        const head = await logClient.getBlockNumber();
        const logs = await collectLogs(
          marketAddress,
          [MARKET_TOPIC_LIST],
          MARKET_DEPLOYMENT_BLOCK,
          head,
        );

        const events = logs
          .map((log) => decodeMarketEvent(log))
          .filter((event): event is MarketEvent => event !== null);

        const listings = sortListings(deriveListings(events)).slice(0, pageSize);

        const resolved = await mapLimit(listings, 4, async (listing) => {
          const [owner, uri] = await Promise.all([
            stateClient.readContract({
              address: gardenAddress,
              abi: agentMintGardenAbi,
              functionName: "ownerOf",
              args: [BigInt(listing.tokenId)],
            }),
            stateClient.readContract({
              address: gardenAddress,
              abi: agentMintGardenAbi,
              functionName: "tokenURI",
              args: [BigInt(listing.tokenId)],
            }),
          ]);
          const metadata = decodeTokenUri(uri);
          return {
            listing,
            live: (owner as Address).toLowerCase() === listing.seller.toLowerCase(),
            item: {
              ...listing,
              name: metadata?.name ?? `GARDEN #${listing.tokenId}`,
              image: metadata?.image,
              traits: metadata?.attributes ?? [],
            } satisfies MarketItem,
          };
        });

        if (cancelled) return;
        const live = resolved.filter((entry) => entry.live).map((entry) => entry.item);
        setItems(live);
        setStaleCount(resolved.length - live.length);
        setStatus("ready");
      } catch (readError) {
        if (!cancelled) {
          setError(describe(readError));
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pageSize, nonce]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  return { status, error, items, staleCount, refresh };
}
