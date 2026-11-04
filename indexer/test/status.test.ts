import { describe, expect, it } from "vitest";
import type { Cursor } from "../src/sync/cursor.js";
import { buildSyncStatus, lagBlocks } from "../src/sync/status.js";

function cursor(stream: string, lastBlock: bigint, updatedAt: Date): Cursor {
  return { chainId: 97, stream, lastBlock, updatedAt };
}

const RUN_AT = new Date("2026-11-04T08:00:00.000Z");

describe("lag", () => {
  it("is zero when the cursor is at the head", () => {
    expect(lagBlocks(100n, 100n)).toBe(0n);
  });

  it("counts the blocks still to scan", () => {
    expect(lagBlocks(110n, 100n)).toBe(10n);
  });

  it("is zero when the head is unknown", () => {
    expect(lagBlocks(null, 100n)).toBe(0n);
  });

  it("is zero when the cursor is somehow ahead of the head", () => {
    expect(lagBlocks(90n, 100n)).toBe(0n);
  });
});

describe("sync status", () => {
  it("reports both streams with their lag", () => {
    const status = buildSyncStatus({
      running: false,
      headBlock: 1_000n,
      lastRunAt: RUN_AT,
      lastError: null,
      cursors: [cursor("market", 950n, RUN_AT), cursor("garden", 990n, RUN_AT)],
      streams: ["garden", "market"],
    });

    expect(status).toEqual({
      running: false,
      headBlock: "1000",
      lagBlocks: "50",
      lastRunAt: RUN_AT.toISOString(),
      lastError: null,
      streams: [
        { stream: "garden", lastBlock: "990", lagBlocks: "10", started: true, updatedAt: RUN_AT.toISOString() },
        { stream: "market", lastBlock: "950", lagBlocks: "50", started: true, updatedAt: RUN_AT.toISOString() },
      ],
    });
  });

  it("shows a configured stream that has never run", () => {
    const status = buildSyncStatus({
      running: false,
      headBlock: 1_000n,
      lastRunAt: null,
      lastError: null,
      cursors: [cursor("garden", 990n, RUN_AT)],
      streams: ["garden", "market"],
    });

    const market = status.streams.find((entry) => entry.stream === "market");
    expect(market).toEqual({
      stream: "market",
      lastBlock: "0",
      lagBlocks: "1000",
      started: false,
      updatedAt: null,
    });
  });

  it("measures overall lag from the slowest stream", () => {
    const status = buildSyncStatus({
      running: true,
      headBlock: 1_000n,
      lastRunAt: RUN_AT,
      lastError: "rpc timeout",
      cursors: [cursor("garden", 990n, RUN_AT), cursor("market", 999n, RUN_AT)],
      streams: ["garden", "market"],
    });

    expect(status.lagBlocks).toBe("10");
    expect(status.lastError).toBe("rpc timeout");
    expect(status.running).toBe(true);
  });

  it("omits lag when the head has never been read", () => {
    const status = buildSyncStatus({
      running: false,
      headBlock: null,
      lastRunAt: null,
      lastError: null,
      cursors: [],
      streams: ["garden"],
    });

    expect(status.headBlock).toBeNull();
    expect(status.lagBlocks).toBeNull();
    expect(status.streams[0]?.lagBlocks).toBeNull();
  });

  it("serialises block numbers as strings", () => {
    const status = buildSyncStatus({
      running: false,
      headBlock: 2n ** 60n,
      lastRunAt: RUN_AT,
      lastError: null,
      cursors: [cursor("garden", 2n ** 60n - 1n, RUN_AT)],
      streams: ["garden"],
    });

    expect(() => JSON.stringify(status)).not.toThrow();
    expect(status.headBlock).toBe((2n ** 60n).toString());
  });
});
