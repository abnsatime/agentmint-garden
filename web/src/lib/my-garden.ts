import type { Address } from "viem";
import type { MintEvent } from "./gallery";
import { zeroAddress } from "./mint";
import type { RawLogShape } from "./log-client";

/**
 * The contract has no ERC-721 Enumerable, so "which tokens do I hold" has to be derived from
 * Transfer events: every acquisition is a Transfer with `to` = me, every disposal one with
 * `from` = me, and the newest event per token decides the current owner.
 */

export interface TransferEvent {
  from: Address;
  to: Address;
  tokenId: number;
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
}

function toNumber(value: string | number | bigint | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return Number(BigInt(value));
}

/** Decodes `Transfer(address indexed from, address indexed to, uint256 indexed tokenId)`. */
export function decodeTransferEvent(log: RawLogShape, topic0: string): TransferEvent | null {
  const topics = log.topics;
  if (topics.length < 4) return null;
  if (topics[0].toLowerCase() !== topic0.toLowerCase()) return null;

  return {
    from: `0x${topics[1].slice(-40)}` as Address,
    to: `0x${topics[2].slice(-40)}` as Address,
    tokenId: Number(BigInt(topics[3])),
    blockNumber: toNumber(log.blockNumber),
    logIndex: toNumber(log.logIndex),
    transactionHash: log.transactionHash ?? "",
  };
}

export interface Holding {
  tokenId: number;
  acquiredTx: string;
  acquiredBlock: number;
  from?: Address;
  /** True when the token was minted straight into this wallet. */
  mintedHere: boolean;
}

function isNewer(candidate: TransferEvent, current: TransferEvent | undefined) {
  if (!current) return true;
  if (candidate.blockNumber !== current.blockNumber) {
    return candidate.blockNumber > current.blockNumber;
  }
  return candidate.logIndex >= current.logIndex;
}

/** Newest first. Tokens transferred away are absent, tokens re-acquired come back. */
export function deriveHoldings(transfers: readonly TransferEvent[], owner: Address): Holding[] {
  const target = owner.toLowerCase();
  const latest = new Map<number, TransferEvent>();

  for (const transfer of transfers) {
    if (isNewer(transfer, latest.get(transfer.tokenId))) latest.set(transfer.tokenId, transfer);
  }

  return [...latest.values()]
    .filter((transfer) => transfer.to.toLowerCase() === target)
    .sort((left, right) => right.tokenId - left.tokenId)
    .map((transfer) => ({
      tokenId: transfer.tokenId,
      acquiredTx: transfer.transactionHash,
      acquiredBlock: transfer.blockNumber,
      from: transfer.from,
      mintedHere: transfer.from.toLowerCase() === zeroAddress,
    }));
}

export type ActivityKind = "mint" | "in" | "out";

export interface ActivityItem {
  kind: ActivityKind;
  tokenId: number;
  counterparty?: Address;
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
  timestamp?: number;
  freeMint?: boolean;
  pricePaid?: bigint;
}

/**
 * One row per movement. A Transfer from the zero address is a mint, and if a
 * `GardenMinted` event exists for the same transaction and token it supplies the price.
 */
export function buildActivity(
  transfers: readonly TransferEvent[],
  mints: readonly MintEvent[],
  owner: Address,
): ActivityItem[] {
  const target = owner.toLowerCase();
  const mintByKey = new Map<string, MintEvent>();
  for (const mint of mints) {
    mintByKey.set(`${mint.transactionHash}:${mint.tokenId}`, mint);
  }

  const items: ActivityItem[] = transfers.map((transfer) => {
    const incoming = transfer.to.toLowerCase() === target;
    const mint = mintByKey.get(`${transfer.transactionHash}:${transfer.tokenId}`);

    if (incoming && transfer.from.toLowerCase() === zeroAddress) {
      return {
        kind: "mint" as const,
        tokenId: transfer.tokenId,
        blockNumber: transfer.blockNumber,
        logIndex: transfer.logIndex,
        transactionHash: transfer.transactionHash,
        freeMint: mint?.freeMint,
        pricePaid: mint?.pricePaid,
      };
    }

    return {
      kind: (incoming ? "in" : "out") as ActivityKind,
      tokenId: transfer.tokenId,
      counterparty: incoming ? transfer.from : transfer.to,
      blockNumber: transfer.blockNumber,
      logIndex: transfer.logIndex,
      transactionHash: transfer.transactionHash,
    };
  });

  return items.sort((left, right) => {
    if (left.blockNumber !== right.blockNumber) return right.blockNumber - left.blockNumber;
    return right.logIndex - left.logIndex;
  });
}

/** De-duplicates logs that came back from overlapping queries. */
export function dedupeTransfers(transfers: readonly TransferEvent[]): TransferEvent[] {
  const seen = new Set<string>();
  const unique: TransferEvent[] = [];
  for (const transfer of transfers) {
    const key = `${transfer.transactionHash}:${transfer.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(transfer);
  }
  return unique;
}

export interface GardenSummary {
  mints: number;
  inbound: number;
  outbound: number;
}

export function summarise(activity: readonly ActivityItem[]): GardenSummary {
  return {
    mints: activity.filter((item) => item.kind === "mint").length,
    inbound: activity.filter((item) => item.kind === "in").length,
    outbound: activity.filter((item) => item.kind === "out").length,
  };
}
