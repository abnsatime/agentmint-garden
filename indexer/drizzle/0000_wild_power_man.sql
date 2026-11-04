CREATE TABLE "garden_mints" (
	"token_id" bigint PRIMARY KEY NOT NULL,
	"minter" text NOT NULL,
	"free_mint" boolean NOT NULL,
	"price_paid_wei" numeric(78, 0) NOT NULL,
	"block_number" bigint NOT NULL,
	"log_index" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"block_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"token_id" bigint NOT NULL,
	"seller" text NOT NULL,
	"buyer" text,
	"price_wei" numeric(78, 0),
	"block_number" bigint NOT NULL,
	"log_index" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"block_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nft_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_id" bigint NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"block_number" bigint NOT NULL,
	"log_index" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"block_time" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_cursors" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"stream" text NOT NULL,
	"last_block" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "garden_mints_minter_idx" ON "garden_mints" USING btree ("minter");--> statement-breakpoint
CREATE INDEX "garden_mints_block_idx" ON "garden_mints" USING btree ("block_number");--> statement-breakpoint
CREATE UNIQUE INDEX "market_events_log_key" ON "market_events" USING btree ("tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "market_events_token_idx" ON "market_events" USING btree ("token_id","block_number");--> statement-breakpoint
CREATE INDEX "market_events_kind_idx" ON "market_events" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "nft_transfers_log_key" ON "nft_transfers" USING btree ("tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "nft_transfers_token_idx" ON "nft_transfers" USING btree ("token_id","block_number");--> statement-breakpoint
CREATE INDEX "nft_transfers_to_idx" ON "nft_transfers" USING btree ("to_address");--> statement-breakpoint
CREATE INDEX "nft_transfers_from_idx" ON "nft_transfers" USING btree ("from_address");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_cursors_chain_stream_key" ON "sync_cursors" USING btree ("chain_id","stream");