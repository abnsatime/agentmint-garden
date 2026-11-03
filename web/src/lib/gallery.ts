import type { Address } from "viem";

/**
 * Pure helpers behind the gallery. Everything here is testable without a node, which
 * matters because the interesting parts are windowing maths and log decoding — the two
 * places where an off-by-one silently hides tokens.
 */

export interface LogWindow {
  fromBlock: bigint;
  toBlock: bigint;
}

/**
 * Splits a block range into windows a public RPC will accept. Public endpoints cap the
 * span (publicnode 50k, drpc 10k), so a single wide query is rejected.
 */
export function planLogWindows(fromBlock: bigint, toBlock: bigint, size: bigint): LogWindow[] {
  if (size <= 0n) throw new Error("window size must be positive");
  if (toBlock < fromBlock) return [];
  const windows: LogWindow[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = cursor + size - 1n > toBlock ? toBlock : cursor + size - 1n;
    windows.push({ fromBlock: cursor, toBlock: end });
    cursor = end + 1n;
  }
  return windows;
}

export interface RawLog {
  topics: readonly string[];
  data: string;
  blockNumber: string | number | bigint;
  transactionHash: string;
}

export interface MintEvent {
  tokenId: number;
  minter: Address;
  freeMint: boolean;
  pricePaid: bigint;
  blockNumber: number;
  transactionHash: string;
}

function toNumber(value: string | number | bigint) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return Number(BigInt(value));
}

/**
 * Decodes `GardenMinted(address indexed minter, uint256 indexed tokenId, bool freeMint,
 * uint256 pricePaid)` from a raw log. Returns null for anything that is not that event,
 * so a topic filter mistake degrades to an empty gallery instead of wrong data.
 */
export function decodeMintEvent(log: RawLog, topic0: string): MintEvent | null {
  const topics = log.topics;
  if (topics.length < 3) return null;
  if (topics[0].toLowerCase() !== topic0.toLowerCase()) return null;

  const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
  if (data.length < 128) return null;

  const tokenId = Number(BigInt(topics[2]));
  const minter = `0x${topics[1].slice(-40)}` as Address;

  return {
    tokenId,
    minter,
    freeMint: BigInt(`0x${data.slice(0, 64)}`) === 1n,
    pricePaid: BigInt(`0x${data.slice(64, 128)}`),
    blockNumber: toNumber(log.blockNumber),
    transactionHash: log.transactionHash,
  };
}

export interface GalleryWindow {
  firstId: number;
  lastId: number;
}

/** Newest tokens first: page 1 of a 4 token collection is ids 4, 3, 2, 1. */
export function galleryWindow(total: number, page: number, pageSize: number): GalleryWindow | null {
  if (total <= 0 || page <= 0 || pageSize <= 0) return null;
  const firstId = total - (page - 1) * pageSize;
  if (firstId <= 0) return null;
  const lastId = Math.max(1, firstId - pageSize + 1);
  return { firstId, lastId };
}

/** Token ids for a window, newest first. */
export function windowTokenIds(window: GalleryWindow): number[] {
  const ids: number[] = [];
  for (let id = window.firstId; id >= window.lastId; id--) ids.push(id);
  return ids;
}

/**
 * Runs `task` over `items` with a concurrency ceiling, preserving input order. Keeps the
 * gallery from firing one request per token into a rate-limited public endpoint.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (limit <= 0) throw new Error("limit must be positive");
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}

/** Short, dependency-free relative time for the "minted 3 minutes ago" line. */
export function relativeTime(thenSeconds: number, nowSeconds: number): string {
  const delta = Math.max(0, nowSeconds - thenSeconds);
  if (delta < 45) return "just now";
  const minutes = Math.round(delta / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return `${Math.round(days / 30)} mo ago`;
}
