import Fastify, { type FastifyInstance } from "fastify";
import type { Database } from "../db/client.js";
import { registerApi } from "../api/routes.js";
import type { HealthPayload } from "./health.js";
import type { SyncStatus } from "../sync/status.js";

export interface ServerDeps {
  /** Injected so the route can be tested without a database. */
  health: () => Promise<HealthPayload>;
  /** Omitted by callers that only serve health; the route is then not registered. */
  status?: () => Promise<SyncStatus>;
  /** Omitted by callers that only serve health; the read endpoints are then not registered. */
  api?: { db: Database };
  /** Origins allowed to read the API from a browser. Empty or undefined disables CORS. */
  corsOrigins?: string[];
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

  const allowed = deps.corsOrigins ?? [];
  if (allowed.length > 0) {
    const permitAll = allowed.includes("*");
    app.addHook("onRequest", async (request, reply) => {
      const origin = request.headers.origin;
      if (!origin) return;
      if (!permitAll && !allowed.includes(origin)) return;

      // The site is a static export on another origin, so every read from a browser is
      // cross-origin. Only GET is served, which keeps this to a simple request.
      reply.header("access-control-allow-origin", origin);
      reply.header("vary", "origin");
      reply.header("access-control-allow-methods", "GET,OPTIONS");
      reply.header("access-control-allow-headers", "content-type");
    });

    app.options("/*", async (_request, reply) => {
      reply.code(204);
      return null;
    });
  }

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

  if (deps.api) registerApi(app, deps.api.db);

  return app;
}
