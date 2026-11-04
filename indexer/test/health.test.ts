import { describe, expect, it } from "vitest";
import { buildHealthPayload, messageOf, type HealthPayload } from "../src/server/health.js";
import { buildServer } from "../src/server/app.js";
import type { Cursor } from "../src/sync/cursor.js";

const config = {
  chainId: 97,
  garden: { address: "0x5bEd1F9d23FaFdE1A4b81215a2888812494d4107" as const, deployBlock: 0n },
  market: { address: "0x153bbf8fc8eD31ab8e73d9b5AE3076d73d3424e2" as const, deployBlock: 0n },
};

function cursor(stream: string, lastBlock: bigint, updatedAt: Date): Cursor {
  return { chainId: 97, stream, lastBlock, updatedAt };
}

describe("health payload", () => {
  it("reports ok when the database and cursors are readable", () => {
    const payload = buildHealthPayload({
      now: 1_000_000,
      startedAt: 985_000,
      config,
      database: { ok: true, latencyMs: 3 },
      cursors: {
        ok: true,
        rows: [cursor("garden", 140_503_100n, new Date(995_000)), cursor("market", 140_688_900n, new Date(999_000))],
      },
    });

    expect(payload.status).toBe("ok");
    expect(payload.uptimeSeconds).toBe(15);
    expect(payload.chainId).toBe(97);
    expect(payload.contracts.garden).toBe(config.garden.address);
    expect(payload.cursors.streams).toEqual([
      { stream: "garden", lastBlock: "140503100", ageSeconds: 5 },
      { stream: "market", lastBlock: "140688900", ageSeconds: 1 },
    ]);
  });

  it("degrades when the database probe fails", () => {
    const payload = buildHealthPayload({
      now: 1_000,
      startedAt: 0,
      config,
      database: { ok: false, latencyMs: 900, error: "connect ECONNREFUSED" },
      cursors: { ok: false, rows: [] },
    });

    expect(payload.status).toBe("degraded");
    expect(payload.database.error).toBe("connect ECONNREFUSED");
    expect(payload.cursors.streams).toEqual([]);
  });

  it("degrades when only the cursor read fails", () => {
    const payload = buildHealthPayload({
      now: 1_000,
      startedAt: 0,
      config,
      database: { ok: true, latencyMs: 2 },
      cursors: { ok: false, rows: [], error: "relation does not exist" },
    });

    expect(payload.status).toBe("degraded");
    expect(payload.cursors.error).toBe("relation does not exist");
  });

  it("serialises block numbers as strings", () => {
    const payload = buildHealthPayload({
      now: 10,
      startedAt: 0,
      config,
      database: { ok: true, latencyMs: 1 },
      cursors: { ok: true, rows: [cursor("garden", 2n ** 60n, new Date(0))] },
    });

    expect(() => JSON.stringify(payload)).not.toThrow();
    expect(payload.cursors.streams[0]?.lastBlock).toBe((2n ** 60n).toString());
  });
});

describe("health route", () => {
  const okPayload: HealthPayload = {
    status: "ok",
    uptimeSeconds: 5,
    checkedAt: "2026-11-04T00:00:00.000Z",
    chainId: 97,
    contracts: { garden: config.garden.address, market: config.market.address },
    database: { ok: true, latencyMs: 1 },
    cursors: { ok: true, streams: [] },
  };

  it("answers 200 with the payload when healthy", async () => {
    const app = buildServer({ health: async () => okPayload, logLevel: "silent" });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", chainId: 97 });
    await app.close();
  });

  it("answers 503 when degraded", async () => {
    const app = buildServer({
      health: async () => ({ ...okPayload, status: "degraded" }),
      logLevel: "silent",
    });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it("answers 503 instead of 500 when the collector throws", async () => {
    const app = buildServer({
      health: async () => {
        throw new Error("pool exhausted");
      },
      logLevel: "silent",
    });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: "degraded" });
    expect(response.json().database.error).toBe("pool exhausted");
    await app.close();
  });
});

describe("error text", () => {
  it("prefers the innermost cause", () => {
    const error = new Error("Failed query: select 1", {
      cause: new Error("connect ECONNREFUSED 127.0.0.1:5432"),
    });
    expect(messageOf(error)).toBe("connect ECONNREFUSED 127.0.0.1:5432");
  });

  it("falls back to the outer message", () => {
    expect(messageOf(new Error("pool exhausted"))).toBe("pool exhausted");
  });

  it("keeps only the first line", () => {
    expect(messageOf(new Error("boom\n    at somewhere"))).toBe("boom");
  });

  it("copes with a non-error", () => {
    expect(messageOf("just a string")).toBe("unknown error");
    expect(messageOf(undefined)).toBe("unknown error");
  });
});
