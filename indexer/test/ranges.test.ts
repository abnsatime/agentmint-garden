import { describe, expect, it } from "vitest";
import { nextWindow, planWindows, resumeBlock, shouldAdvance } from "../src/sync/ranges.js";

describe("window planning", () => {
  it("splits an exact multiple", () => {
    expect(planWindows(0n, 99n, 50n)).toEqual([
      { fromBlock: 0n, toBlock: 49n },
      { fromBlock: 50n, toBlock: 99n },
    ]);
  });

  it("keeps the remainder in a short final window", () => {
    expect(planWindows(100n, 180n, 50n)).toEqual([
      { fromBlock: 100n, toBlock: 149n },
      { fromBlock: 150n, toBlock: 180n },
    ]);
  });

  it("handles a single block", () => {
    expect(planWindows(7n, 7n, 50n)).toEqual([{ fromBlock: 7n, toBlock: 7n }]);
  });

  it("covers a span wider than the RPC allows", () => {
    const windows = planWindows(140_503_064n, 140_574_865n, 45_000n);
    expect(windows).toHaveLength(2);
    expect(windows[0]?.fromBlock).toBe(140_503_064n);
    expect(windows.at(-1)?.toBlock).toBe(140_574_865n);
    for (let index = 1; index < windows.length; index += 1) {
      expect(windows[index]?.fromBlock).toBe((windows[index - 1]?.toBlock ?? 0n) + 1n);
    }
  });

  it("returns nothing for an inverted range", () => {
    expect(planWindows(10n, 5n, 50n)).toEqual([]);
  });

  it("refuses a zero window", () => {
    expect(() => planWindows(0n, 10n, 0n)).toThrow();
  });
});

describe("next window", () => {
  it("returns the first slice up to the head", () => {
    expect(nextWindow(100n, 1_000n, 400n)).toEqual({ fromBlock: 100n, toBlock: 499n });
  });

  it("clamps to the head", () => {
    expect(nextWindow(900n, 1_000n, 400n)).toEqual({ fromBlock: 900n, toBlock: 1_000n });
  });

  it("returns null once the head is behind the cursor", () => {
    expect(nextWindow(1_001n, 1_000n, 400n)).toBeNull();
  });
});

describe("resume point", () => {
  it("starts at the deployment block without a cursor", () => {
    expect(resumeBlock(null, 140_503_064n)).toBe(140_503_064n);
    expect(resumeBlock(undefined, 140_503_064n)).toBe(140_503_064n);
  });

  it("continues one block past the cursor", () => {
    expect(resumeBlock({ lastBlock: 140_503_100n }, 140_503_064n)).toBe(140_503_101n);
  });

  it("never resumes before the deployment block", () => {
    expect(resumeBlock({ lastBlock: 1n }, 140_503_064n)).toBe(140_503_064n);
  });
});

describe("monotonic cursor", () => {
  it("accepts a fresh cursor", () => {
    expect(shouldAdvance(null, 10n)).toBe(true);
    expect(shouldAdvance(undefined, 0n)).toBe(true);
  });

  it("accepts a forward move", () => {
    expect(shouldAdvance(10n, 11n)).toBe(true);
  });

  it("rejects a rewind or a repeat", () => {
    expect(shouldAdvance(10n, 10n)).toBe(false);
    expect(shouldAdvance(10n, 9n)).toBe(false);
  });

  it("rejects a negative block", () => {
    expect(shouldAdvance(10n, -1n)).toBe(false);
  });
});
