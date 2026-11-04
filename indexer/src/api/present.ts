/**
 * Row-to-DTO mapping. Every number that can exceed a JavaScript integer travels as a decimal
 * string, and every timestamp as ISO-8601, so the payload is plain JSON.
 */

export interface TokenMetadataView {
  name: string;
  image: string | null;
  traits: Array<{ trait_type: string; value: string }>;
}

export interface TokenSummary {
  tokenId: string;
  owner: string;
  mintedBy: string | null;
  mintedAt: string | null;
  freeMint: boolean | null;
  pricePaidWei: string | null;
  mintedTxHash: string | null;
  metadata: TokenMetadataView | null;
}

export interface TransferView {
  from: string;
  to: string;
  blockNumber: string;
  logIndex: number;
  txHash: string;
  blockTime: string;
}

export interface MintView {
  minter: string;
  freeMint: boolean;
  pricePaidWei: string;
  blockNumber: string;
  txHash: string;
  blockTime: string;
}

export interface ListingView {
  tokenId: string;
  seller: string;
  priceWei: string;
  sinceBlock: string;
  sinceTime: string | null;
  metadata: TokenMetadataView | null;
}

export interface SaleView {
  tokenId: string;
  seller: string;
  buyer: string | null;
  priceWei: string | null;
  blockNumber: string;
  logIndex: number;
  txHash: string;
  blockTime: string;
}

export interface ActivityView {
  direction: "in" | "out";
  tokenId: string;
  counterparty: string;
  blockNumber: string;
  logIndex: number;
  txHash: string;
  blockTime: string;
  /** Set only for mints, so the activity list can show free/paid without another call. */
  freeMint: boolean | null;
  pricePaidWei: string | null;
}

export interface TokenDetail {
  tokenId: string;
  owner: string;
  metadata: TokenMetadataView | null;
  mint: MintView | null;
  transfers: TransferView[];
  listing: { seller: string; priceWei: string; sinceBlock: string; live: boolean } | null;
}

function iso(value: Date | string | null): string {
  if (value === null) return "";
  return value instanceof Date ? value.toISOString() : value;
}

export interface TokenRow {
  token_id: string;
  owner: string;
  minter: string | null;
  free_mint: boolean | null;
  price_paid_wei: string | null;
  mint_block: string | null;
  mint_time: string | null;
  mint_tx: string | null;
  meta_name: string | null;
  meta_image: string | null;
  meta_traits: Array<{ trait_type: string; value: string }> | null;
}

export function toMetadataView(
  name: string | null | undefined,
  image: string | null | undefined,
  traits: Array<{ trait_type: string; value: string }> | null | undefined,
): TokenMetadataView | null {
  if (!name) return null;
  return { name, image: image ?? null, traits: traits ?? [] };
}

export function toTokenSummary(row: TokenRow): TokenSummary {
  return {
    tokenId: row.token_id,
    owner: row.owner,
    mintedBy: row.minter,
    mintedAt: row.mint_time === null ? null : iso(row.mint_time),
    freeMint: row.free_mint,
    pricePaidWei: row.price_paid_wei,
    mintedTxHash: row.mint_tx,
    metadata: toMetadataView(row.meta_name, row.meta_image, row.meta_traits),
  };
}

export interface TransferRow {
  from_address: string;
  to_address: string;
  block_number: string;
  log_index: number;
  tx_hash: string;
  block_time: string;
}

export function toTransferView(row: TransferRow): TransferView {
  return {
    from: row.from_address,
    to: row.to_address,
    blockNumber: row.block_number,
    logIndex: row.log_index,
    txHash: row.tx_hash,
    blockTime: iso(row.block_time),
  };
}

export interface MintRow {
  minter: string;
  free_mint: boolean;
  price_paid_wei: string;
  block_number: string;
  tx_hash: string;
  block_time: string;
}

export function toMintView(row: MintRow): MintView {
  return {
    minter: row.minter,
    freeMint: row.free_mint,
    pricePaidWei: row.price_paid_wei,
    blockNumber: row.block_number,
    txHash: row.tx_hash,
    blockTime: iso(row.block_time),
  };
}

export interface ListingRow {
  token_id: string;
  seller: string;
  price_wei: string;
  block_number: string;
  block_time: string | null;
  meta_name?: string | null;
  meta_image?: string | null;
  meta_traits?: Array<{ trait_type: string; value: string }> | null;
}

export function toListingView(row: ListingRow): ListingView {
  return {
    tokenId: row.token_id,
    seller: row.seller,
    priceWei: row.price_wei,
    sinceBlock: row.block_number,
    sinceTime: row.block_time === null ? null : iso(row.block_time),
    metadata: toMetadataView(row.meta_name, row.meta_image, row.meta_traits),
  };
}

export interface SaleRow {
  token_id: string;
  seller: string;
  buyer: string | null;
  price_wei: string | null;
  block_number: string;
  log_index: number;
  tx_hash: string;
  block_time: string;
}

export function toSaleView(row: SaleRow): SaleView {
  return {
    tokenId: row.token_id,
    seller: row.seller,
    buyer: row.buyer,
    priceWei: row.price_wei,
    blockNumber: row.block_number,
    logIndex: row.log_index,
    txHash: row.tx_hash,
    blockTime: iso(row.block_time),
  };
}

/** `owner` decides the direction, so a mint (from the zero address) reads as an inbound. */
export function toActivityView(
  row: TransferRow & {
    to_address: string;
    from_address: string;
    token_id: string;
    free_mint?: boolean | null;
    price_paid_wei?: string | null;
  },
  owner: string,
): ActivityView {
  const lower = owner.toLowerCase();
  const inbound = row.to_address.toLowerCase() === lower;
  return {
    direction: inbound ? "in" : "out",
    tokenId: row.token_id,
    counterparty: inbound ? row.from_address : row.to_address,
    blockNumber: row.block_number,
    logIndex: row.log_index,
    txHash: row.tx_hash,
    blockTime: iso(row.block_time),
    freeMint: row.free_mint ?? null,
    pricePaidWei: row.price_paid_wei ?? null,
  };
}
