import { sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/client.js";
import type { PositionCursor, PriceCursor } from "./params.js";
import {
  toActivityView,
  toListingView,
  toMintView,
  toSaleView,
  toTokenSummary,
  toMetadataView,
  toTransferView,
  type ActivityView,
  type ListingView,
  type MintRow,
  type SaleRow,
  type SaleView,
  type TokenDetail,
  type TokenRow,
  type TokenSummary,
  type TransferRow,
} from "./present.js";

/**
 * Read queries over the raw event tables.
 *
 * "Current state" is always derived: the owner of a token is its newest transfer, and a listing
 * is the newest market event for that token. No projections are stored, so these can be
 * corrected without re-syncing.
 */

async function rows<T>(db: Database, statement: SQL): Promise<T[]> {
  const result = (await db.execute(statement)) as unknown as { rows: T[] };
  return result.rows;
}

const LATEST_OWNER = sql`
  select distinct on (token_id) token_id, to_address, block_number, log_index
  from nft_transfers
  order by token_id, block_number desc, log_index desc
`;

const LATEST_MARKET_EVENT = sql`
  select distinct on (token_id) token_id, kind, seller, price_wei, block_number, log_index, block_time
  from market_events
  order by token_id, block_number desc, log_index desc
`;

export interface ListTokensParams {
  owner: string | null;
  limit: number;
  before: bigint | null;
}

export async function listTokens(db: Database, params: ListTokensParams): Promise<TokenSummary[]> {
  const owner = params.owner;
  const before = params.before === null ? null : params.before.toString();

  const result = await rows<TokenRow>(
    db,
    sql`
      with latest as (${LATEST_OWNER})
      select latest.token_id::text as token_id,
             latest.to_address as owner,
             m.minter,
             m.free_mint,
             m.price_paid_wei::text as price_paid_wei,
             m.block_number::text as mint_block,
             to_char(m.block_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as mint_time,
             tm.name as meta_name,
             tm.image as meta_image,
             tm.traits as meta_traits
      from latest
      left join garden_mints m on m.token_id = latest.token_id
      left join token_metadata tm on tm.token_id = latest.token_id
      where (${owner}::text is null or lower(latest.to_address) = lower(${owner}))
        and (${before}::bigint is null or latest.token_id < ${before}::bigint)
      order by latest.token_id desc
      limit ${params.limit}
    `,
  );

  return result.map(toTokenSummary);
}

interface OwnerRow {
  owner: string;
  kind?: string;
  seller?: string;
  price_wei?: string;
  block_number?: string;
  block_time?: Date | null;
}

export async function getToken(db: Database, tokenId: bigint): Promise<TokenDetail | null> {
  const id = tokenId.toString();

  const ownerRows = await rows<OwnerRow>(
    db,
    sql`select to_address as owner from nft_transfers
        where token_id = ${id}::bigint
        order by block_number desc, log_index desc limit 1`,
  );

  const mintRows = await rows<MintRow>(
    db,
    sql`select minter, free_mint, price_paid_wei::text as price_paid_wei,
               block_number::text as block_number, tx_hash,
               to_char(block_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as block_time
        from garden_mints where token_id = ${id}::bigint`,
  );

  const metaRows = await rows<{
    name: string;
    image: string | null;
    traits: Array<{ trait_type: string; value: string }> | null;
  }>(db, sql`select name, image, traits from token_metadata where token_id = ${id}::bigint`);

  const owner = ownerRows[0]?.owner;
  const mint = mintRows[0];
  const meta = metaRows[0];

  if (!owner && !mint) return null;

  const transferRows = await rows<TransferRow>(
    db,
    sql`select from_address, to_address, block_number::text as block_number, log_index,
               tx_hash, to_char(block_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as block_time
        from nft_transfers where token_id = ${id}::bigint
        order by block_number desc, log_index desc limit 100`,
  );

  const marketRows = await rows<OwnerRow>(
    db,
    sql`select kind, seller, price_wei::text as price_wei, block_number::text as block_number,
               to_char(block_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as block_time
        from market_events where token_id = ${id}::bigint
        order by block_number desc, log_index desc limit 1`,
  );

  const market = marketRows[0];
  const active = market && (market.kind === "listed" || market.kind === "price_updated");

  return {
    tokenId: id,
    owner: owner ?? "",
    metadata: toMetadataView(meta?.name, meta?.image, meta?.traits),
    mint: mint ? toMintView(mint) : null,
    transfers: transferRows.map(toTransferView),
    listing:
      active && market
        ? {
            seller: market.seller ?? "",
            priceWei: market.price_wei ?? "0",
            sinceBlock: market.block_number ?? "0",
            live: Boolean(owner) && (market.seller ?? "").toLowerCase() === owner?.toLowerCase(),
          }
        : null,
  };
}

export interface ListListingsParams {
  limit: number;
  cursor: PriceCursor | null;
}

export async function listListings(
  db: Database,
  params: ListListingsParams,
): Promise<ListingView[]> {
  const price = params.cursor === null ? null : params.cursor.priceWei.toString();
  const token = params.cursor === null ? null : params.cursor.tokenId.toString();

  const result = await rows<{
    token_id: string;
    seller: string;
    price_wei: string;
    block_number: string;
    block_time: string | null;
    meta_name: string | null;
    meta_image: string | null;
    meta_traits: Array<{ trait_type: string; value: string }> | null;
  }>(
    db,
    sql`
      with latest_event as (${LATEST_MARKET_EVENT}),
           latest_owner as (${LATEST_OWNER})
      select e.token_id::text as token_id,
             e.seller,
             e.price_wei::text as price_wei,
             e.block_number::text as block_number,
             to_char(e.block_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as block_time,
             tm.name as meta_name,
             tm.image as meta_image,
             tm.traits as meta_traits
      from latest_event e
      join latest_owner o on o.token_id = e.token_id
      left join token_metadata tm on tm.token_id = e.token_id
      where e.kind in ('listed', 'price_updated')
        and o.to_address = e.seller
        and (${price}::numeric is null
             or (e.price_wei, e.token_id) > (${price}::numeric, ${token}::bigint))
      order by e.price_wei asc, e.token_id asc
      limit ${params.limit}
    `,
  );

  return result.map(toListingView);
}

export interface ListActivityParams {
  owner: string;
  limit: number;
  cursor: PositionCursor | null;
}

export async function listActivity(
  db: Database,
  params: ListActivityParams,
): Promise<ActivityView[]> {
  const block = params.cursor === null ? null : params.cursor.blockNumber.toString();
  const index = params.cursor === null ? null : params.cursor.logIndex;

  const result = await rows<TransferRow & { token_id: string }>(
    db,
    sql`
      select token_id::text as token_id, from_address, to_address,
             block_number::text as block_number, log_index, tx_hash,
             to_char(block_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as block_time
      from nft_transfers
      where (lower(to_address) = lower(${params.owner}) or lower(from_address) = lower(${params.owner}))
        and (${block}::bigint is null
             or (block_number, log_index) < (${block}::bigint, ${index}::integer))
      order by block_number desc, log_index desc
      limit ${params.limit}
    `,
  );

  return result.map((row) => toActivityView(row, params.owner));
}

export interface ListSalesParams {
  limit: number;
  cursor: PositionCursor | null;
}

export async function listSales(db: Database, params: ListSalesParams): Promise<SaleView[]> {
  const block = params.cursor === null ? null : params.cursor.blockNumber.toString();
  const index = params.cursor === null ? null : params.cursor.logIndex;

  const result = await rows<SaleRow>(
    db,
    sql`
      select token_id::text as token_id, seller, buyer, price_wei::text as price_wei,
             block_number::text as block_number, log_index, tx_hash,
             to_char(block_time at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as block_time
      from market_events
      where kind = 'sold'
        and (${block}::bigint is null
             or (block_number, log_index) < (${block}::bigint, ${index}::integer))
      order by block_number desc, log_index desc
      limit ${params.limit}
    `,
  );

  return result.map(toSaleView);
}
