# AgentMint Indexer

A small service that reads the garden and market contracts once, stores the events in
PostgreSQL, and lets the frontend ask questions instead of scanning logs in the browser.

**Status: foundation only.** This commit contains the database schema, the sync cursor and
`/health`. There is no log-sync loop and no read API yet, and the frontend still scans logs
itself.

## Why

`/gallery`, `/me` and `/market` each fetch `eth_getLogs` from a public endpoint. Three separate
scans per visit means slow first loads, RPC rate limits, and — when an endpoint refuses the
block span — an indefinite loading state. One shared index fixes all three.

## Stack

Node.js 22 · TypeScript · Fastify · PostgreSQL 17 · Drizzle ORM · Docker Compose · Vitest.

## Quick start

```bash
cd indexer
pnpm install
cp .env.example .env

pnpm db:up        # postgres:17-alpine on 5432, volume-backed
pnpm db:generate  # regenerate SQL migrations after a schema change
pnpm db:migrate   # apply them
pnpm dev          # http://127.0.0.1:8081/health
```

`pnpm db:up` needs Docker. Without Docker, point `DATABASE_URL` at any reachable Postgres and
run the migrations by hand.

## Endpoints

| Method | Path | Behaviour |
|---|---|---|
| `GET` | `/health` | `200` when the database answers and cursors are readable, `503` otherwise |

The payload carries the chain, both contract addresses, the database latency, and one entry per
sync stream with its last block and how long ago the cursor moved. A degraded payload is a
normal response — the endpoint reports the failure rather than throwing a 500.

## Schema

Raw events only; everything user-facing is a query over these rows, so a projection can be
fixed without re-syncing.

| Table | Holds |
|---|---|
| `sync_cursors` | one row per `(chain_id, stream)`: the last block whose logs were committed |
| `garden_mints` | `GardenMinted` — token id, minter, free flag, price paid |
| `nft_transfers` | every `Transfer`, mints included, with sender and recipient |
| `market_events` | `Listed` / `PriceUpdated` / `Cancelled` / `Sold` |

`nft_transfers` and `market_events` are unique on `(tx_hash, log_index)`, so replaying a window
cannot duplicate rows.

## Cursor semantics

`advanceCursor` never moves backwards: it upserts with `greatest(existing, incoming)`. The sync
loop is expected to write events and the cursor in one transaction, so a crash mid-batch resumes
from the last committed block instead of skipping it.

`resumeBlock` starts a stream at its deployment block, continues one past the cursor, and never
goes below the deployment block.

## Tests

```bash
pnpm test          # pure unit tests always; database tests when DATABASE_URL is set
pnpm typecheck
pnpm build
```

`test/cursor.test.ts` applies the migrations and exercises the cursor against a real database.
It skips itself when `DATABASE_URL` is unset, which is what happens in a checkout without
Postgres.

## Layout

```
src/env.ts            configuration, validated at startup
src/db/schema.ts      Drizzle tables
src/db/client.ts      pool + drizzle client
src/sync/ranges.ts    block-window planning and cursor guards (pure)
src/sync/events.ts    log decoders for both contracts (pure)
src/sync/cursor.ts    read / advance / list cursors
src/server/health.ts  health payload assembly and probe
src/server/app.ts     Fastify factory (health injected, so it is testable)
src/index.ts          process entry
```
