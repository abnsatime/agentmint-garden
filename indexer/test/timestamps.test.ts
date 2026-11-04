import { describe, expect, it } from "vitest";
import {
  blocksNeedingTimestamps,
  resolveTimestamps,
  timestampLookup,
} from "../src/sync/timestamps.js";

const AT = new Date("2026-11-04T00:00:00.000Z");

function countingFetcher() {
  const calls: bigint[] = [];
  const fetch = async (block: bigint) => {
    calls.push(block);
    return 1_700_000_000n + block;
  };
  return { fetch, calls };
}

describe("choosing blocks to fetch", () => {
  it("deduplicates and sorts", () => {
    const cache = new Map<bigint, Date>();
    expect(blocksNeedingTimestamps([10n, 2n, 10n, 5n], cache)).toEqual([2n, 5n, 10n]);
  });

  it("skips blocks already cached", () => {
    const cache = new Map([[5n, AT]]);
    expect(blocksNeedingTimestamps([5n, 6n], cache)).toEqual([6n]);
  });

  it("returns nothing for an empty input", () => {
    expect(blocksNeedingTimestamps([], new Map())).toEqual([]);
  });
});

describe("resolving timestamps", () => {
  it("fetches each block once and fills the cache", async () => {
    const cache = new Map<bigint, Date>();
    const { fetch, calls } = countingFetcher();

    await resolveTimestamps([7n, 7n, 8n], fetch, cache);

    expect(calls.sort()).toEqual([7n, 8n]);
    expect(cache.get(7n)).toEqual(new Date(1_700_000_007_000));
    expect(cache.get(8n)).toEqual(new Date(1_700_000_008_000));
  });

  it("does not refetch what another window already resolved", async () => {
    const cache = new Map<bigint, Date>();
    const { fetch, calls } = countingFetcher();

    await resolveTimestamps([7n], fetch, cache);
    await resolveTimestamps([7n, 8n], fetch, cache);

    expect(calls.sort()).toEqual([7n, 8n]);
  });

  it("returns immediately when everything is cached", async () => {
    const cache = new Map([[1n, AT]]);
    const { fetch, calls } = countingFetcher();

    await resolveTimestamps([1n], fetch, cache);
    expect(calls).toEqual([]);
  });
});

describe("lookup", () => {
  it("answers from the cache", () => {
    expect(timestampLookup(new Map([[3n, AT]]))(3n)).toBe(AT);
  });

  it("throws on a miss rather than writing a wrong time", () => {
    expect(() => timestampLookup(new Map())(3n)).toThrow(/no timestamp cached for block 3/);
  });
});
