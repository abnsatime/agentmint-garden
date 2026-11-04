"use client";

import { useCallback, useEffect, useState } from "react";
import type { Hex } from "viem";
import { useAccount } from "wagmi";
import { agentMintGardenAbi, deploymentBlock, gardenAddress } from "./contracts";
import {
  GARDEN_MINTED_TOPIC,
  TRANSFER_TOPIC,
  blockTimestamps,
  collectLogs,
  logClient,
  stateClient,
} from "./log-client";
import { decodeMintEvent, mapLimit, type MintEvent } from "./gallery";
import {
  buildActivity,
  dedupeTransfers,
  decodeTransferEvent,
  deriveHoldings,
  summarise,
  type ActivityItem,
  type Holding,
} from "./my-garden";
import { decodeTokenUri } from "./mint";
import { fetchActivity, fetchTokens, indexerEnabled } from "./indexer";
import { toActivityItem, toHoldings } from "./indexer-map";

export type GardenSource = "index" | "chain";

export interface MyToken extends Holding {
  name: string;
  image?: string;
  traits: Array<{ trait_type: string; value: string }>;
  acquiredAt?: number;
}

export interface MyGarden {
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  holdings: MyToken[];
  activity: ActivityItem[];
  mintsUsed: number;
  maxPerWallet: number;
  counts: { mints: number; inbound: number; outbound: number };
  source: GardenSource;
  refresh: () => void;
}

const EMPTY: Omit<MyGarden, "refresh"> = {
  status: "idle",
  error: null,
  holdings: [],
  activity: [],
  mintsUsed: 0,
  maxPerWallet: 0,
  counts: { mints: 0, inbound: 0, outbound: 0 },
  source: indexerEnabled ? "index" : "chain",
};

function topicFor(address: string): Hex {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function describe(error: unknown) {
  return ((error as Error)?.message ?? "Could not read your garden.").split("\n")[0];
}

/**
 * Everything about one wallet: what it holds now, how it got there, and what the tokens look
 * like. The index answers all three in two requests; without it the log scan below reconstructs
 * the same thing from Transfer events, because the contract is not enumerable.
 */
export function useMyGarden(): MyGarden {
  const { address } = useAccount();
  const [state, setState] = useState<Omit<MyGarden, "refresh">>(EMPTY);
  const [nonce, setNonce] = useState(0);

  const source = state.source;

  useEffect(() => {
    if (!address) {
      setState(EMPTY);
    }
  }, [address]);

  // Index path.
  useEffect(() => {
    if (!address || source !== "index") return;
    let cancelled = false;

    (async () => {
      setState((current) => ({ ...current, status: "loading", error: null }));
      try {
        const [activityPage, tokenPage, mintedBy, maxPerWallet] = await Promise.all([
          fetchActivity({ owner: address, limit: 200 }),
          fetchTokens({ owner: address, limit: 100 }),
          stateClient.readContract({
            address: gardenAddress,
            abi: agentMintGardenAbi,
            functionName: "mintedBy",
            args: [address],
          }),
          stateClient.readContract({
            address: gardenAddress,
            abi: agentMintGardenAbi,
            functionName: "MAX_PER_WALLET",
          }),
        ]);

        const activity = activityPage.items.map(toActivityItem);
        const art = new Map(tokenPage.items.map((token) => [Number(token.tokenId), token]));
        const holdings: MyToken[] = toHoldings(tokenPage.items, activityPage.items).map(
          (holding) => {
            const metadata = art.get(holding.tokenId)?.metadata ?? null;
            return {
              ...holding,
              name: metadata?.name ?? `GARDEN #${holding.tokenId}`,
              image: metadata?.image ?? undefined,
              traits: metadata?.traits ?? [],
            };
          },
        );

        if (cancelled) return;
        setState({
          status: "ready",
          error: null,
          holdings,
          activity,
          mintsUsed: Number(mintedBy),
          maxPerWallet: Number(maxPerWallet),
          counts: summarise(activity),
          source: "index",
        });
      } catch (readError) {
        if (cancelled) return;
        console.warn("[me] index unavailable, falling back to logs:", readError);
        setState((current) => ({ ...current, source: "chain" }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, source, nonce]);

  // Chain path.
  useEffect(() => {
    if (!address || source !== "chain") return;
    let cancelled = false;

    (async () => {
      setState((current) => ({ ...current, status: "loading", error: null }));
      try {
        const head = await logClient.getBlockNumber();
        const me = topicFor(address);

        const [incomingLogs, outgoingLogs, mintLogs] = await Promise.all([
          collectLogs(gardenAddress, [TRANSFER_TOPIC, null, me], deploymentBlock, head),
          collectLogs(gardenAddress, [TRANSFER_TOPIC, me], deploymentBlock, head),
          collectLogs(gardenAddress, [GARDEN_MINTED_TOPIC, me], deploymentBlock, head),
        ]);

        const transfers = dedupeTransfers(
          [...incomingLogs, ...outgoingLogs]
            .map((log) => decodeTransferEvent(log, TRANSFER_TOPIC))
            .filter((event): event is NonNullable<typeof event> => event !== null),
        );

        const mints = mintLogs
          .map((log) =>
            decodeMintEvent(
              {
                topics: log.topics,
                data: log.data,
                blockNumber: log.blockNumber ?? 0,
                transactionHash: log.transactionHash ?? "",
              },
              GARDEN_MINTED_TOPIC,
            ),
          )
          .filter((event): event is MintEvent => event !== null);

        const activity = buildActivity(transfers, mints, address);
        const holdings = deriveHoldings(transfers, address);

        const stamps = await blockTimestamps([
          ...activity.map((item) => item.blockNumber),
          ...holdings.map((holding) => holding.acquiredBlock),
        ]);

        const [mintedBy, maxPerWallet] = await Promise.all([
          stateClient.readContract({
            address: gardenAddress,
            abi: agentMintGardenAbi,
            functionName: "mintedBy",
            args: [address],
          }),
          stateClient.readContract({
            address: gardenAddress,
            abi: agentMintGardenAbi,
            functionName: "MAX_PER_WALLET",
          }),
        ]);

        const withArt = await mapLimit(holdings, 4, async (holding) => {
          try {
            const uri = await stateClient.readContract({
              address: gardenAddress,
              abi: agentMintGardenAbi,
              functionName: "tokenURI",
              args: [BigInt(holding.tokenId)],
            });
            const metadata = decodeTokenUri(uri);
            return {
              ...holding,
              name: metadata?.name ?? `GARDEN #${holding.tokenId}`,
              image: metadata?.image,
              traits: metadata?.attributes ?? [],
              acquiredAt: stamps.get(holding.acquiredBlock),
            };
          } catch {
            return {
              ...holding,
              name: `GARDEN #${holding.tokenId}`,
              traits: [],
              acquiredAt: stamps.get(holding.acquiredBlock),
            };
          }
        });

        const withTimes = activity.map((item) => ({
          ...item,
          timestamp: stamps.get(item.blockNumber),
        }));

        if (!cancelled) {
          setState({
            status: "ready",
            error: null,
            holdings: withArt,
            activity: withTimes,
            mintsUsed: Number(mintedBy),
            maxPerWallet: Number(maxPerWallet),
            counts: summarise(activity),
            source: "chain",
          });
        }
      } catch (readError) {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            status: "error",
            error: describe(readError),
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, source, nonce]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  return { ...state, refresh };
}
