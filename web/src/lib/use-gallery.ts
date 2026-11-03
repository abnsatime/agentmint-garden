"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, http, toEventSelector, toHex, type Address } from "viem";
import { bscTestnet } from "viem/chains";
import { agentMintGardenAbi, deploymentBlock, gardenAddress } from "./contracts";
import { decodeTokenUri } from "./mint";
import {
  decodeMintEvent,
  galleryWindow,
  mapLimit,
  planLogWindows,
  windowTokenIds,
  type MintEvent,
} from "./gallery";
import { bscTestnetRpcUrl } from "./wagmi";

/** publicnode allows a 50k block span; the app's default endpoint allows far less. */
const LOG_RPC_URL = "https://bsc-testnet-rpc.publicnode.com";
const LOG_WINDOW = 45_000n;

const readClient = createPublicClient({ chain: bscTestnet, transport: http(bscTestnetRpcUrl) });
const logClient = createPublicClient({ chain: bscTestnet, transport: http(LOG_RPC_URL) });

const GARDEN_MINTED_TOPIC = toEventSelector("GardenMinted(address,uint256,bool,uint256)");

export interface GalleryItem {
  tokenId: number;
  owner: Address;
  name: string;
  image?: string;
  hue?: string;
}

export interface GalleryMintEvent extends MintEvent {
  timestamp: number;
}

export interface GalleryState {
  status: "loading" | "ready" | "error";
  error: string | null;
  supply: number | null;
  page: number;
  pageSize: number;
  items: GalleryItem[];
  mints: Record<number, GalleryMintEvent>;
  mintsStatus: "loading" | "ready" | "unavailable";
  hasNext: boolean;
  nextPage: () => void;
  previousPage: () => void;
  refresh: () => void;
}

async function withRetry<T>(task: () => Promise<T>, attempts = 2, delayMs = 600): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function describe(error: unknown) {
  const message = (error as Error)?.message ?? "The gallery could not be loaded.";
  return message.split("\n")[0];
}

/** Reads token metadata and ownership for one page, newest token first. */
export function useGallery(pageSize = 24): GalleryState {
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [supply, setSupply] = useState<number | null>(null);
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [mints, setMints] = useState<Record<number, GalleryMintEvent>>({});
  const [mintsStatus, setMintsStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  // Collection size.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const total = await readClient.readContract({
          address: gardenAddress,
          abi: agentMintGardenAbi,
          functionName: "totalSupply",
        });
        if (!cancelled) setSupply(Number(total));
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
  }, [nonce]);

  // Page of tokens.
  useEffect(() => {
    if (supply === null) return;
    let cancelled = false;

    (async () => {
      setStatus("loading");
      const window = galleryWindow(supply, page, pageSize);
      if (!window) {
        if (!cancelled) {
          setItems([]);
          setStatus("ready");
        }
        return;
      }
      try {
        const tokens = await mapLimit(windowTokenIds(window), 6, async (tokenId) => {
          const [uri, owner] = await Promise.all([
            readClient.readContract({
              address: gardenAddress,
              abi: agentMintGardenAbi,
              functionName: "tokenURI",
              args: [BigInt(tokenId)],
            }),
            readClient.readContract({
              address: gardenAddress,
              abi: agentMintGardenAbi,
              functionName: "ownerOf",
              args: [BigInt(tokenId)],
            }),
          ]);
          const metadata = decodeTokenUri(uri);
          return {
            tokenId,
            owner,
            name: metadata?.name ?? `GARDEN #${tokenId}`,
            image: metadata?.image,
            hue: metadata?.attributes?.[0]?.value,
          } satisfies GalleryItem;
        });
        if (!cancelled) {
          setItems(tokens);
          setStatus("ready");
          setError(null);
        }
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
  }, [supply, page, pageSize, nonce]);

  // Mint provenance from GardenMinted logs. Best effort: a node that refuses logs only
  // costs the "minted by / when" line, never the artwork.
  useEffect(() => {
    if (supply === null || supply === 0) return;
    let cancelled = false;

    (async () => {
      try {
        const head = await logClient.getBlockNumber();
        const events: MintEvent[] = [];
        for (const window of planLogWindows(deploymentBlock, head, LOG_WINDOW)) {
          // Raw eth_getLogs: the topic-filtered form keeps the decoding in a pure,
          // unit-tested function instead of relying on the client's event typing.
          // One retry, because public endpoints rate-limit when the artwork reads are
          // still in flight.
          const logs = await withRetry(() =>
            logClient.request({
              method: "eth_getLogs",
              params: [
                {
                  address: gardenAddress,
                  topics: [GARDEN_MINTED_TOPIC],
                  fromBlock: toHex(window.fromBlock),
                  toBlock: toHex(window.toBlock),
                },
              ],
            }),
          );
          for (const log of logs) {
            const decoded = decodeMintEvent(
              {
                topics: log.topics,
                data: log.data,
                // viem types these as nullable for pending logs; a mined event always has both.
                blockNumber: log.blockNumber ?? 0n,
                transactionHash: log.transactionHash ?? "",
              },
              GARDEN_MINTED_TOPIC,
            );
            if (decoded) events.push(decoded);
          }
        }

        const blockNumbers = [...new Set(events.map((event) => event.blockNumber))];
        const timestamps = new Map<number, number>();
        await mapLimit(blockNumbers, 4, async (blockNumber) => {
          const block = await logClient.getBlock({ blockNumber: BigInt(blockNumber) });
          timestamps.set(blockNumber, Number(block.timestamp));
        });

        const byToken: Record<number, GalleryMintEvent> = {};
        for (const event of events) {
          byToken[event.tokenId] = { ...event, timestamp: timestamps.get(event.blockNumber) ?? 0 };
        }
        if (!cancelled) {
          setMints(byToken);
          setMintsStatus("ready");
        }
      } catch (logError) {
        // Provenance is optional, but silence here hides a broken endpoint.
        console.warn("[gallery] GardenMinted logs unavailable:", logError);
        if (!cancelled) setMintsStatus("unavailable");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supply, nonce]);

  const nextPage = useCallback(() => setPage((current) => current + 1), []);
  const previousPage = useCallback(() => setPage((current) => Math.max(1, current - 1)), []);
  const refresh = useCallback(() => {
    setMints({});
    setMintsStatus("loading");
    setNonce((value) => value + 1);
  }, []);

  return {
    status,
    error,
    supply,
    page,
    pageSize,
    items,
    mints,
    mintsStatus,
    hasNext: supply !== null && page * pageSize < supply,
    nextPage,
    previousPage,
    refresh,
  };
}
