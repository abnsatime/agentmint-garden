import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Raw event stores. The indexer writes what the chain emitted and nothing derived: holdings,
 * order books and wallets are queries over these rows, so a bug in a projection can be fixed
 * by re-querying instead of re-syncing.
 */

/** One row per (chain, stream). The sync loop resumes from `lastBlock + 1`. */
export const syncCursors = pgTable(
  "sync_cursors",
  {
    id: serial("id").primaryKey(),
    chainId: integer("chain_id").notNull(),
    stream: text("stream").notNull(),
    // No SQL default: the only writer is advanceCursor, which always supplies a value.
    lastBlock: bigint("last_block", { mode: "bigint" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sync_cursors_chain_stream_key").on(table.chainId, table.stream)],
);

/** `GardenMinted(address,uint256,bool,uint256)`, one row per minted token. */
export const gardenMints = pgTable(
  "garden_mints",
  {
    tokenId: bigint("token_id", { mode: "bigint" }).primaryKey(),
    minter: text("minter").notNull(),
    freeMint: boolean("free_mint").notNull(),
    pricePaidWei: numeric("price_paid_wei", { precision: 78, scale: 0 }).notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    logIndex: integer("log_index").notNull(),
    txHash: text("tx_hash").notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("garden_mints_minter_idx").on(table.minter),
    index("garden_mints_block_idx").on(table.blockNumber),
  ],
);

/** `Transfer(address,address,uint256)` on the collection, mints included. */
export const nftTransfers = pgTable(
  "nft_transfers",
  {
    id: serial("id").primaryKey(),
    tokenId: bigint("token_id", { mode: "bigint" }).notNull(),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    logIndex: integer("log_index").notNull(),
    txHash: text("tx_hash").notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("nft_transfers_log_key").on(table.txHash, table.logIndex),
    index("nft_transfers_token_idx").on(table.tokenId, table.blockNumber),
    index("nft_transfers_to_idx").on(table.toAddress),
    index("nft_transfers_from_idx").on(table.fromAddress),
  ],
);

/** `Listed` / `PriceUpdated` / `Cancelled` / `Sold` from the market contract. */
export const marketEvents = pgTable(
  "market_events",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    tokenId: bigint("token_id", { mode: "bigint" }).notNull(),
    seller: text("seller").notNull(),
    buyer: text("buyer"),
    priceWei: numeric("price_wei", { precision: 78, scale: 0 }),
    blockNumber: bigint("block_number", { mode: "bigint" }).notNull(),
    logIndex: integer("log_index").notNull(),
    txHash: text("tx_hash").notNull(),
    blockTime: timestamp("block_time", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("market_events_log_key").on(table.txHash, table.logIndex),
    index("market_events_token_idx").on(table.tokenId, table.blockNumber),
    index("market_events_kind_idx").on(table.kind),
  ],
);

/**
 * Decoded `tokenURI`: the artwork and traits, read once here so no browser has to.
 * A token without a row simply has not been backfilled yet.
 */
export const tokenMetadata = pgTable("token_metadata", {
  tokenId: bigint("token_id", { mode: "bigint" }).primaryKey(),
  name: text("name").notNull(),
  image: text("image"),
  traits: jsonb("traits").$type<Array<{ trait_type: string; value: string }>>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SyncCursorRow = typeof syncCursors.$inferSelect;
export type GardenMintRow = typeof gardenMints.$inferInsert;
export type NftTransferRow = typeof nftTransfers.$inferInsert;
export type MarketEventRow = typeof marketEvents.$inferInsert;
