import { sql } from "drizzle-orm";
import type { Database } from "../db/client.js";
import type { Config } from "../env.js";
import { listCursors, type Cursor } from "../sync/cursor.js";

export interface CursorSummary {
  stream: string;
  lastBlock: string;
  ageSeconds: number | null;
}

export interface HealthPayload {
  status: "ok" | "degraded";
  uptimeSeconds: number;
  checkedAt: string;
  chainId: number;
  contracts: { garden: string; market: string };
  database: { ok: boolean; latencyMs: number; error?: string };
  cursors: { ok: boolean; streams: CursorSummary[]; error?: string };
}

interface BuildInput {
  now: number;
  startedAt: number;
  config: Pick<Config, "chainId" | "garden" | "market">;
  database: { ok: boolean; latencyMs: number; error?: string };
  cursors: { ok: boolean; rows: Cursor[]; error?: string };
}

function summarise(rows: Cursor[], now: number): CursorSummary[] {
  return rows
    .map((cursor) => ({
      stream: cursor.stream,
      lastBlock: cursor.lastBlock.toString(),
      ageSeconds: Math.max(0, Math.round((now - cursor.updatedAt.getTime()) / 1000)),
    }))
    .sort((left, right) => left.stream.localeCompare(right.stream));
}

/** Pure payload assembly, so the shape can be pinned by tests. */
export function buildHealthPayload(input: BuildInput): HealthPayload {
  const database = { ...input.database };
  const cursors = {
    ok: input.cursors.ok,
    streams: input.cursors.ok ? summarise(input.cursors.rows, input.now) : [],
    ...(input.cursors.error ? { error: input.cursors.error } : {}),
  };

  return {
    status: database.ok && cursors.ok ? "ok" : "degraded",
    uptimeSeconds: Math.max(0, Math.round((input.now - input.startedAt) / 1000)),
    checkedAt: new Date(input.now).toISOString(),
    chainId: input.config.chainId,
    contracts: {
      garden: input.config.garden.address,
      market: input.config.market.address,
    },
    database,
    cursors,
  };
}

/**
 * Drizzle wraps driver failures in its own "Failed query" error, so the useful text (for
 * instance `connect ECONNREFUSED 127.0.0.1:5432`) sits on the cause chain.
 */
function messageOf(error: unknown, depth = 0): string {
  if (!error || depth > 4) return "unknown error";

  const record = error as { message?: unknown; cause?: unknown };
  if (record.cause) {
    const inner = messageOf(record.cause, depth + 1);
    if (inner !== "unknown error") return inner;
  }

  const message = typeof record.message === "string" ? record.message : "";
  const first = message.split("\n")[0]?.trim();
  return first || "unknown error";
}

export { messageOf };

/**
 * Probes the database, then reads the cursors. A failure in either place degrades the payload
 * instead of throwing, because /health must answer even when everything is broken.
 */
export async function collectHealth(
  db: Database,
  config: Config,
  startedAt: number,
): Promise<HealthPayload> {
  const now = Date.now();
  const startedProbe = performance.now();
  let database: BuildInput["database"];

  try {
    await db.execute(sql`select 1`);
    database = { ok: true, latencyMs: Math.round(performance.now() - startedProbe) };
  } catch (error) {
    database = {
      ok: false,
      latencyMs: Math.round(performance.now() - startedProbe),
      error: messageOf(error),
    };
  }

  if (!database.ok) {
    return buildHealthPayload({ now, startedAt, config, database, cursors: { ok: false, rows: [] } });
  }

  try {
    const rows = await listCursors(db, config.chainId);
    return buildHealthPayload({ now, startedAt, config, database, cursors: { ok: true, rows } });
  } catch (error) {
    return buildHealthPayload({
      now,
      startedAt,
      config,
      database,
      cursors: { ok: false, rows: [], error: messageOf(error) },
    });
  }
}
