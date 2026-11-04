import { getAddress, toEventSelector, type Address, type Hex } from "viem";

/**
 * Log decoders. They take the raw shape the RPC returns, so they stay pure and testable
 * without a node, and they return null rather than guessing when a log does not fit.
 */

export const TRANSFER_TOPIC = toEventSelector("Transfer(address,address,uint256)");
export const GARDEN_MINTED_TOPIC = toEventSelector("GardenMinted(address,uint256,bool,uint256)");

export const MARKET_TOPICS = {
  listed: toEventSelector("Listed(uint256,address,uint256)"),
  priceUpdated: toEventSelector("PriceUpdated(uint256,address,uint256)"),
  cancelled: toEventSelector("Cancelled(uint256,address)"),
  sold: toEventSelector("Sold(uint256,address,address,uint256)"),
} as const;

export type MarketKind = "listed" | "price_updated" | "cancelled" | "sold";

export interface RawLog {
  topics: readonly string[];
  data: string;
  blockNumber: string | number | bigint | null;
  transactionHash: string | null;
  logIndex?: string | number | bigint | null;
}

export interface GardenMintEvent {
  tokenId: bigint;
  minter: Address;
  freeMint: boolean;
  pricePaidWei: bigint;
  blockNumber: bigint;
  logIndex: number;
  txHash: string;
}

export interface TransferEvent {
  tokenId: bigint;
  from: Address;
  to: Address;
  blockNumber: bigint;
  logIndex: number;
  txHash: string;
}

export interface MarketEvent {
  kind: MarketKind;
  tokenId: bigint;
  seller: Address;
  buyer?: Address;
  priceWei?: bigint;
  blockNumber: bigint;
  logIndex: number;
  txHash: string;
}

function blockOf(value: RawLog["blockNumber"]): bigint {
  if (value === null) return 0n;
  return typeof value === "bigint" ? value : BigInt(value);
}

function indexOf(value: RawLog["logIndex"]): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

function addressOf(topic: string | undefined): Address | null {
  if (!topic || topic.length < 42) return null;
  try {
    // Stored as checksummed text so the same wallet is never two different strings.
    return getAddress(`0x${topic.slice(-40)}`);
  } catch {
    return null;
  }
}

function dataWord(data: string, index: number): bigint | null {
  const body = data.startsWith("0x") ? data.slice(2) : data;
  const start = index * 64;
  if (body.length < start + 64) return null;
  return BigInt(`0x${body.slice(start, start + 64)}`);
}

function isTopic(topic: string | undefined, expected: Hex): boolean {
  return (topic ?? "").toLowerCase() === expected.toLowerCase();
}

export function decodeGardenMint(log: RawLog): GardenMintEvent | null {
  if (!isTopic(log.topics[0], GARDEN_MINTED_TOPIC)) return null;
  if (log.topics.length < 3) return null;

  const tokenId = BigInt(log.topics[2] as string);
  const minter = addressOf(log.topics[1]);
  const free = dataWord(log.data, 0);
  const price = dataWord(log.data, 1);
  if (!minter || free === null || price === null) return null;

  return {
    tokenId,
    minter,
    freeMint: free === 1n,
    pricePaidWei: price,
    blockNumber: blockOf(log.blockNumber),
    logIndex: indexOf(log.logIndex),
    txHash: log.transactionHash ?? "",
  };
}

export function decodeTransfer(log: RawLog): TransferEvent | null {
  if (!isTopic(log.topics[0], TRANSFER_TOPIC)) return null;
  if (log.topics.length < 4) return null;

  const from = addressOf(log.topics[1]);
  const to = addressOf(log.topics[2]);
  if (!from || !to) return null;

  return {
    tokenId: BigInt(log.topics[3] as string),
    from,
    to,
    blockNumber: blockOf(log.blockNumber),
    logIndex: indexOf(log.logIndex),
    txHash: log.transactionHash ?? "",
  };
}

export function decodeMarketEvent(log: RawLog): MarketEvent | null {
  const topic0 = log.topics[0];
  const base = {
    blockNumber: blockOf(log.blockNumber),
    logIndex: indexOf(log.logIndex),
    txHash: log.transactionHash ?? "",
  };

  if (isTopic(topic0, MARKET_TOPICS.listed) || isTopic(topic0, MARKET_TOPICS.priceUpdated)) {
    if (log.topics.length < 3) return null;
    const seller = addressOf(log.topics[2]);
    const price = dataWord(log.data, 0);
    if (!seller || price === null) return null;
    return {
      kind: isTopic(topic0, MARKET_TOPICS.listed) ? "listed" : "price_updated",
      tokenId: BigInt(log.topics[1] as string),
      seller,
      priceWei: price,
      ...base,
    };
  }

  if (isTopic(topic0, MARKET_TOPICS.cancelled)) {
    if (log.topics.length < 3) return null;
    const seller = addressOf(log.topics[2]);
    if (!seller) return null;
    return {
      kind: "cancelled",
      tokenId: BigInt(log.topics[1] as string),
      seller,
      ...base,
    };
  }

  if (isTopic(topic0, MARKET_TOPICS.sold)) {
    if (log.topics.length < 4) return null;
    const seller = addressOf(log.topics[2]);
    const buyer = addressOf(log.topics[3]);
    if (!seller || !buyer) return null;
    return {
      kind: "sold",
      tokenId: BigInt(log.topics[1] as string),
      seller,
      buyer,
      priceWei: dataWord(log.data, 0) ?? undefined,
      ...base,
    };
  }

  return null;
}

/** The block a log belongs to, in the shape the store writes. */
export function logBlockNumber(log: RawLog): bigint {
  return blockOf(log.blockNumber);
}

/** Topics to OR together for a single market scan. */
export const MARKET_TOPIC_LIST: Hex[] = [
  MARKET_TOPICS.listed,
  MARKET_TOPICS.priceUpdated,
  MARKET_TOPICS.cancelled,
  MARKET_TOPICS.sold,
];
