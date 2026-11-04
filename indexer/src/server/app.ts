import Fastify, { type FastifyInstance } from "fastify";
import type { HealthPayload } from "./health.js";
import type { SyncStatus } from "../sync/status.js";

export interface ServerDeps {
  /** Injected so the route can be tested without a database. */
  health: () => Promise<HealthPayload>;
  /** Omitted by callers that only serve health; the route is then not registered. */
  status?: () => Promise<SyncStatus>;
  logLevel?: string;
}

function messageOf(error: unknown): string {
  return ((error as Error)?.message ?? "health check failed").split("\n")[0] ?? "";
}

function degraded(error: unknown): HealthPayload {
  const message = messageOf(error);
  const now = Date.now();
  return {
    status: "degraded",
    uptimeSeconds: 0,
    checkedAt: new Date(now).toISOString(),
    chainId: 0,
    contracts: { garden: "", market: "" },
    database: { ok: false, latencyMs: 0, error: message },
    cursors: { ok: false, streams: [], error: message },
  };
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: { level: deps.logLevel ?? "info" } });

  app.get("/health", async (_request, reply) => {
    try {
      const payload = await deps.health();
      reply.code(payload.status === "ok" ? 200 : 503);
      return payload;
    } catch (error) {
      // A broken health dependency must not turn into a 500: the endpoint reports it.
      reply.code(503);
      return degraded(error);
    }
  });

  if (deps.status) {
    const readStatus = deps.status;
    app.get("/sync/status", async (_request, reply) => {
      try {
        return await readStatus();
      } catch (error) {
        reply.code(503);
        return { error: messageOf(error) };
      }
    });
  }

  return app;
}
