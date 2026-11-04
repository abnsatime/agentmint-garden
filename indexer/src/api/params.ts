import { getAddress, type Address } from "viem";

/** Query parsing that fails loudly. Every parameter is optional; a bad one is a 400. */

export class BadRequest extends Error {
  readonly parameter: string;

  constructor(parameter: string, message: string) {
    super(message);
    this.name = "BadRequest";
    this.parameter = parameter;
  }
}

export interface LimitOptions {
  fallback?: number;
  max?: number;
}

export function parseLimit(raw: unknown, options: LimitOptions = {}): number {
  const fallback = options.fallback ?? 50;
  const max = options.max ?? 200;

  if (raw === undefined || raw === null || raw === "") return fallback;
  if (typeof raw !== "string") throw new BadRequest("limit", "limit must be a single number");

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequest("limit", `limit must be a positive integer, got ${JSON.stringify(raw)}`);
  }
  return Math.min(parsed, max);
}

const HEX_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/**
 * Addresses are stored checksummed, and callers paste them in whatever case they were copied
 * in, so the filter is accepted in any case and normalised before it is compared.
 */
export function parseAddress(raw: unknown, parameter = "owner"): Address | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || !HEX_ADDRESS.test(raw)) {
    throw new BadRequest(parameter, `${parameter} must be a 0x-prefixed 20-byte address`);
  }
  return getAddress(raw.toLowerCase());
}

export function parseTokenId(raw: unknown): bigint {
  if (typeof raw !== "string" || raw === "") {
    throw new BadRequest("tokenId", "tokenId must be a base-10 integer");
  }
  if (!/^\d{1,78}$/.test(raw)) {
    throw new BadRequest("tokenId", "tokenId must be a base-10 integer");
  }
  return BigInt(raw);
}

function splitPair(raw: unknown, parameter: string): [string, string] | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") {
    throw new BadRequest(parameter, `${parameter} must be a single value`);
  }
  const parts = raw.split(":");
  if (parts.length !== 2) {
    throw new BadRequest(parameter, `${parameter} must look like <first>:<second>`);
  }
  return [parts[0] as string, parts[1] as string];
}

export interface PositionCursor {
  blockNumber: bigint;
  logIndex: number;
}

/** `<block>:<logIndex>` — the keyset for activity and sales, which grow without bound. */
export function parsePositionCursor(raw: unknown): PositionCursor | null {
  const pair = splitPair(raw, "cursor");
  if (!pair) return null;

  const [block, index] = pair;
  if (!/^\d{1,20}$/.test(block) || !/^\d{1,9}$/.test(index)) {
    throw new BadRequest("cursor", "cursor must look like <blockNumber>:<logIndex>");
  }
  return { blockNumber: BigInt(block), logIndex: Number(index) };
}

export interface PriceCursor {
  priceWei: bigint;
  tokenId: bigint;
}

/** `<priceWei>:<tokenId>` — the keyset for the order book, sorted by price. */
export function parsePriceCursor(raw: unknown): PriceCursor | null {
  const pair = splitPair(raw, "cursor");
  if (!pair) return null;

  const [price, token] = pair;
  if (!/^\d{1,78}$/.test(price) || !/^\d{1,78}$/.test(token)) {
    throw new BadRequest("cursor", "cursor must look like <priceWei>:<tokenId>");
  }
  return { priceWei: BigInt(price), tokenId: BigInt(token) };
}

/** `<tokenId>` — the keyset for the token list, which is ordered by id. */
export function parseTokenCursor(raw: unknown): bigint | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || !/^\d{1,78}$/.test(raw)) {
    throw new BadRequest("cursor", "cursor must be a token id");
  }
  return BigInt(raw);
}
