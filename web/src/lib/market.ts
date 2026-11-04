import { toEventSelector, type Address, type Hex } from "viem";
import { formatTbnb } from "./mint";

/**
 * Pure helpers for the market: decoding its events back into a live order book, and turning a
 * tBNB amount into the "about one dollar" figure the collection is priced in.
 */

export const MARKET_TOPICS = {
  listed: toEventSelector("Listed(uint256,address,uint256)"),
  priceUpdated: toEventSelector("PriceUpdated(uint256,address,uint256)"),
  cancelled: toEventSelector("Cancelled(uint256,address)"),
  sold: toEventSelector("Sold(uint256,address,address,uint256)"),
} as const;

export const MARKET_TOPIC_LIST: Hex[] = [
  MARKET_TOPICS.listed,
  MARKET_TOPICS.priceUpdated,
  MARKET_TOPICS.cancelled,
  MARKET_TOPICS.sold,
];

export type MarketEventKind = "listed" | "price" | "cancelled" | "sold";

export interface MarketEvent {
  kind: MarketEventKind;
  tokenId: number;
  seller?: Address;
  buyer?: Address;
  price?: bigint;
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
}

export interface RawMarketLog {
  topics: readonly string[];
  data: string;
  blockNumber: string | number | bigint | null;
  transactionHash: string | null;
  logIndex?: string | number | bigint | null;
}

function toNumber(value: string | number | bigint | null | undefined) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  return Number(BigInt(value));
}

function addressOf(topic: string): Address {
  return `0x${topic.slice(-40)}` as Address;
}

export function decodeMarketEvent(log: RawMarketLog): MarketEvent | null {
  const topics = log.topics;
  const topic0 = (topics[0] ?? "").toLowerCase();
  const base = {
    blockNumber: toNumber(log.blockNumber),
    logIndex: toNumber(log.logIndex),
    transactionHash: log.transactionHash ?? "",
  };

  if (topic0 === MARKET_TOPICS.listed.toLowerCase() || topic0 === MARKET_TOPICS.priceUpdated.toLowerCase()) {
    if (topics.length < 3) return null;
    const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
    if (data.length < 64) return null;
    return {
      kind: topic0 === MARKET_TOPICS.listed.toLowerCase() ? "listed" : "price",
      tokenId: Number(BigInt(topics[1])),
      seller: addressOf(topics[2]),
      price: BigInt(`0x${data.slice(0, 64)}`),
      ...base,
    };
  }

  if (topic0 === MARKET_TOPICS.cancelled.toLowerCase()) {
    if (topics.length < 3) return null;
    return {
      kind: "cancelled",
      tokenId: Number(BigInt(topics[1])),
      seller: addressOf(topics[2]),
      ...base,
    };
  }

  if (topic0 === MARKET_TOPICS.sold.toLowerCase()) {
    if (topics.length < 4) return null;
    const data = log.data.startsWith("0x") ? log.data.slice(2) : log.data;
    return {
      kind: "sold",
      tokenId: Number(BigInt(topics[1])),
      seller: addressOf(topics[2]),
      buyer: addressOf(topics[3]),
      price: data.length >= 64 ? BigInt(`0x${data.slice(0, 64)}`) : undefined,
      ...base,
    };
  }

  return null;
}

export interface Listing {
  tokenId: number;
  seller: Address;
  price: bigint;
  sinceBlock: number;
}

/**
 * Replays the event stream into the current order book. Listed adds, PriceUpdated changes,
 * Cancelled and Sold remove; anything else about the same token is ignored.
 */
export function deriveListings(events: readonly MarketEvent[]): Listing[] {
  const ordered = [...events].sort((left, right) => {
    if (left.blockNumber !== right.blockNumber) return left.blockNumber - right.blockNumber;
    return left.logIndex - right.logIndex;
  });

  const book = new Map<number, Listing>();
  for (const event of ordered) {
    if (event.kind === "listed") {
      if (event.seller && event.price !== undefined) {
        book.set(event.tokenId, {
          tokenId: event.tokenId,
          seller: event.seller,
          price: event.price,
          sinceBlock: event.blockNumber,
        });
      }
      continue;
    }
    if (event.kind === "price") {
      const current = book.get(event.tokenId);
      if (current && event.price !== undefined) {
        book.set(event.tokenId, { ...current, price: event.price });
      }
      continue;
    }
    book.delete(event.tokenId);
  }

  return [...book.values()];
}

/** Cheapest ask first, then oldest listing — the order a buyer expects. */
export function sortListings(listings: readonly Listing[]): Listing[] {
  return [...listings].sort((left, right) => {
    if (left.price !== right.price) return left.price < right.price ? -1 : 1;
    return left.sinceBlock - right.sinceBlock;
  });
}

export function randomListingOf(listings: readonly Listing[], tokenId: number): Listing | undefined {
  return listings.find((listing) => listing.tokenId === tokenId);
}

export function tbnbToUsd(price: bigint, rate: number): number {
  if (rate <= 0) return 0;
  return (Number(price) / 1e18) * rate;
}

export function usdToTbnb(usd: number, rate: number): bigint {
  if (rate <= 0 || usd <= 0) return 0n;
  return BigInt(Math.round((usd / rate) * 1e18));
}

export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  if (amount === 0) return "$0";
  // A hair under a dollar should still read as a dollar rather than "$1.000".
  if (amount >= 0.995) return `$${amount.toFixed(2)}`;
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(3)}`;
}

/** The default ask: about one dollar, which is the collection's reference unit. */
export function suggestFloorPrice(rate: number): bigint {
  return usdToTbnb(1, rate);
}

export interface PriceLabel {
  tbnb: string;
  usd: string;
}

export function describePrice(price: bigint, rate: number): PriceLabel {
  return { tbnb: formatTbnb(price), usd: formatUsd(tbnbToUsd(price, rate)) };
}

/** Maps a market revert into one sentence, mirroring the mint panel's approach. */
export function decodeMarketError(error: unknown): string {
  const text = collect(error);
  const known: Array<[RegExp, string]> = [
    [/User rejected|User denied|4001/i, "You rejected the request in your wallet."],
    [/MarketNotApproved/, "Approve the market for this token first, then list it."],
    [/MarketAlreadyListed/, "This token is already listed. Cancel the old listing or change its price."],
    [/MarketNotOwner/, "That token is not in this wallet."],
    [/MarketNotListed/, "This listing no longer exists."],
    [/MarketNotSeller/, "Only the seller can change this listing."],
    [/MarketSelfPurchase/, "You cannot buy your own listing."],
    [/MarketIncorrectPayment/, "The price changed before the transaction landed. Refresh and try again."],
    [/MarketStaleListing/, "The seller moved the token away, so this listing is dead."],
    [/MarketTransferFailed/, "The token transfer failed; the seller may have revoked approval."],
    [/MarketSellerCannotReceive/, "The seller's wallet refused the payment."],
    [/MarketZeroPrice/, "Set a price above zero."],
    [
      /insufficient funds/i,
      "This wallet does not hold enough tBNB for the price plus gas.",
    ],
  ];
  for (const [pattern, message] of known) {
    if (pattern.test(text)) return message;
  }
  return "The action could not be completed. Please try again.";
}

function collect(error: unknown, depth = 0, seen = new Set<unknown>()): string {
  if (!error || depth > 5 || seen.has(error)) return "";
  seen.add(error);
  if (typeof error === "string") return error;
  if (typeof error !== "object") return "";

  const record = error as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ["name", "shortMessage", "message", "reason", "errorName"]) {
    const value = record[key];
    if (typeof value === "string" && value) parts.push(value);
  }
  const data = record.data;
  if (typeof data === "string") parts.push(data);
  if (data && typeof data === "object") {
    const nested = (data as Record<string, unknown>).errorName;
    if (typeof nested === "string") parts.push(nested);
  }
  for (const key of ["cause", "error", "data"]) {
    const nested = record[key];
    if (nested && typeof nested === "object") parts.push(collect(nested, depth + 1, seen));
  }
  return parts.filter(Boolean).join(" ");
}
