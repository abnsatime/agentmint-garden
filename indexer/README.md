# AgentMint Indexer

A small service that reads the garden and market contracts once, stores the events in
PostgreSQL, and lets the frontend ask questions instead of scanning logs in the browser.

**Status: sync loop and read API.** The frontend still scans logs itself; switching the three
routes over is the next step.

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
pnpm sync         # one pass over both streams, then exit
pnpm dev          # http://127.0.0.1:8081/health
```

`pnpm db:up` needs Docker. Without Docker, point `DATABASE_URL` at any reachable Postgres and
run the migrations by hand.

## Endpoints

| Method | Path | Behaviour |
|---|---|---|
| `GET` | `/health` | `200` when the database answers and cursors are readable, `503` otherwise |
| `GET` | `/sync/status` | cursors, per-stream lag, and the last error of *this process* |
| `GET` | `/tokens` | every indexed token, newest first; `owner`, `limit`, `cursor` |
| `GET` | `/tokens/:tokenId` | one token: mint, transfer history, live listing |
| `GET` | `/market/listings` | the live order book, cheapest first; `limit`, `cursor` |
| `GET` | `/market/sales` | recent sales, newest first; `limit`, `cursor` |
| `GET` | `/activity` | one wallet's transfers in and out; `owner` (required), `limit`, `cursor` |

### Read API

Everything is derived from the event tables, so a wrong projection is a query fix rather than a
re-sync:

- a token's owner is its newest `Transfer`
- a listing is the newest market event for that token, and it only counts as live while the
  seller still owns the token — a seller who moved it away is filtered out, which is what the
  contract would reject

Every list is keyset paginated and returns `{ items, next }`; `next` is the cursor for the
following page, or `null` at the end. Numbers that can exceed a JavaScript integer are decimal
strings, and timestamps are ISO-8601 UTC. A bad parameter is a `400` that names it:

```json
{ "error": "limit must be a positive integer, got \"zero\"", "parameter": "limit" }
```

Addresses are accepted in any case and normalised, since callers paste them from logs and
explorers in whatever case they were copied.

`headBlock`, `lastRunAt` and the lags in `/sync/status` describe the server process's own runs,
so they are `null` until that process syncs. The cursors themselves are shared through the
database, which is why `lastBlock` is always populated once any process has synced.

## Syncing

```bash
pnpm sync                      # one pass, then exit
pnpm sync --loop 12            # keep going every 12 seconds
pnpm sync --max-windows 5      # bound a pass (useful on a cold start)
```

Two streams, each with its own cursor:

| Stream | Contract | Topics |
|---|---|---|
| `garden` | the collection | `GardenMinted`, `Transfer` |
| `market` | the market | `Listed`, `PriceUpdated`, `Cancelled`, `Sold` |

A pass reads the head, then walks each stream in windows of `LOG_WINDOW_BLOCKS` (45k by
default, under the 50k cap most public endpoints enforce). For every window:

1. `eth_getLogs` with the stream's topics OR-ed together — one call per window, not per event
2. block timestamps for the blocks that actually produced a log, cached across windows
3. decode into rows and commit **together with the cursor, in one transaction**

Step 3 is the guarantee: a crash leaves the cursor where it was, so the window is re-read rather
than skipped, and the unique keys on `(tx_hash, log_index)` make that replay a no-op.

## Schema

Raw events only; everything user-facing is a query over these rows, so a projection can be
fixed without re-syncing.

| Table | Holds |
|---|---|
| `sync_cursors` | one row per `(chain_id, stream)`: the last block whose logs were committed |
| `garden_mints` | `GardenMinted` — token id, minter, free flag, price paid |
| `nft_transfers` | every `Transfer`, mints included, with sender and recipient |
| `market_events` | `Listed` / `PriceUpdated` / `Cancelled` / `Sold` |

## Cursor semantics

`advanceCursor` never moves backwards: it upserts with `greatest(existing, incoming)`. The sync
loop writes events and the cursor in one transaction, so a crash mid-batch resumes from the last
committed block instead of skipping it.

`resumeBlock` starts a stream at its deployment block, continues one past the cursor, and never
goes below the deployment block.

## Tests

```bash
pnpm test          # pure unit tests always; database tests when DATABASE_URL is set
pnpm typecheck
pnpm build
```

The database suites (`cursor`, `writer`, `runner`) apply the migrations and run against a real
PostgreSQL. They skip themselves when `DATABASE_URL` is unset. Test files run sequentially
because those suites share one database and clean their tables between tests.

## Layout

```
src/env.ts             configuration, validated at startup
src/env-file.ts        .env reader that only fills gaps
src/db/schema.ts       Drizzle tables
src/db/client.ts       pool + drizzle client
src/chain/reader.ts    the chain surface the runner needs (narrow, fakeable)
src/sync/ranges.ts     block-window planning and cursor guards (pure)
src/sync/events.ts     log decoders for both contracts (pure)
src/sync/rows.ts       log -> row builders (pure)
src/sync/timestamps.ts block-time cache (pure parts testable)
src/sync/cursor.ts     read / advance / list cursors
src/sync/writer.ts     one transaction: rows plus cursor
src/sync/streams.ts    the two stream definitions
src/sync/runner.ts     the sync loop
src/sync/status.ts     status payload (pure)
src/api/params.ts      query parsing, 400s on bad input
src/api/present.ts     row to JSON (bigint as string, timestamps as ISO)
src/api/repository.ts  the read queries
src/api/routes.ts      the five endpoints
src/server/health.ts   health payload assembly and probe
src/server/app.ts      Fastify factory (dependencies injected)
src/cli/sync.ts        `pnpm sync`
src/index.ts           process entry
```
