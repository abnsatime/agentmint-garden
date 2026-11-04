import type { Address } from "viem";

/**
 * The read API. When `NEXT_PUBLIC_INDEXER_URL` is set the pages ask it first and only fall back
 * to scanning logs when it cannot answer, which is what keeps a static export usable even with
 * no index running.
 */

const configured = process.env.NEXT_PUBLIC_INDEXER_URL?.trim();

export const indexerUrl: string | null = configured ? configured.replace(/\/+$/, "") : null;

export const indexerEnabled = indexerUrl !== null;

export class IndexerUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndexerUnavailable";
  }
}

export interface TokenMetadataView {
  name: string;
  image: string | null;
  traits: Array<{ trait_type: string; value: string }>;
}

export interface IndexToken {
  tokenId: string;
  owner: string;
  mintedBy: string | null;
  mintedAt: string | null;
  freeMint: boolean | null;
  pricePaidWei: string | null;
  mintedTxHash: string | null;
  metadata: TokenMetadataView | null;
}

export interface IndexTransfer {
  from: string;
  to: string;
  blockNumber: string;
  logIndex: number;
  txHash: string;
  blockTime: string;
}

export interface IndexListing {
  tokenId: string;
  seller: string;
  priceWei: string;
  sinceBlock: string;
  sinceTime: string | null;
  metadata: TokenMetadataView | null;
}

export interface IndexActivity {
  direction: "in" | "out";
  tokenId: string;
  counterparty: string;
  blockNumber: string;
  logIndex: number;
  txHash: string;
  blockTime: string;
  freeMint: boolean | null;
  pricePaidWei: string | null;
}

export interface IndexTokenDetail extends IndexToken {
  mint: {
    minter: string;
    freeMint: boolean;
    pricePaidWei: string;
    blockNumber: string;
    txHash: string;
    blockTime: string;
  } | null;
  transfers: IndexTransfer[];
  listing: { seller: string; priceWei: string; sinceBlock: string; live: boolean } | null;
}

export interface Page<T> {
  items: T[];
  next: string | null;
  /** Collection size, present on /tokens. */
  total?: number;
}

const TIMEOUT_MS = 8_000;

async function getJson<T>(path: string): Promise<T> {
  const base = indexerUrl;
  if (!base) throw new IndexerUnavailable("no indexer configured");

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      headers: { accept: "application/json" },
      // A stale index is better than a hung page.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new IndexerUnavailable(((error as Error)?.message ?? "indexer unreachable").split("\n")[0]);
  }

  if (!response.ok) {
    throw new IndexerUnavailable(`indexer answered ${response.status}`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new IndexerUnavailable("indexer returned invalid JSON");
  }
}

export function fetchTokens(params: {
  owner?: Address | string;
  limit?: number;
  cursor?: string | null;
}): Promise<Page<IndexToken>> {
  const query = new URLSearchParams();
  if (params.owner) query.set("owner", params.owner);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.cursor) query.set("cursor", params.cursor);
  const suffix = query.toString();
  return getJson<Page<IndexToken>>(`/tokens${suffix ? `?${suffix}` : ""}`);
}

export async function fetchToken(tokenId: number | string): Promise<IndexTokenDetail | null> {
  try {
    return await getJson<IndexTokenDetail>(`/tokens/${tokenId}`);
  } catch (error) {
    if (error instanceof IndexerUnavailable && /404/.test(error.message)) return null;
    throw error;
  }
}

export function fetchListings(params: {
  limit?: number;
  cursor?: string | null;
}): Promise<Page<IndexListing>> {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", String(params.limit));
  if (params.cursor) query.set("cursor", params.cursor);
  const suffix = query.toString();
  return getJson<Page<IndexListing>>(`/market/listings${suffix ? `?${suffix}` : ""}`);
}

export function fetchActivity(params: {
  owner: Address | string;
  limit?: number;
  cursor?: string | null;
}): Promise<Page<IndexActivity>> {
  const query = new URLSearchParams({ owner: params.owner });
  if (params.limit) query.set("limit", String(params.limit));
  if (params.cursor) query.set("cursor", params.cursor);
  return getJson<Page<IndexActivity>>(`/activity?${query.toString()}`);
}
