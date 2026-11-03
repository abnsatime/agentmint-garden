import { describe, expect, it } from "vitest";
import {
  decodeMintEvent,
  galleryWindow,
  mapLimit,
  planLogWindows,
  relativeTime,
  windowTokenIds,
  type RawLog,
} from "./gallery";

const TOPIC0 = "0x5364ac3010fc3eeb4bccb7c122bc7e2386392c3edbbc07b284192fe51b6982ce";

function mintLog(tokenId: number, minter: string, free: boolean, paid: bigint): RawLog {
  const word = (value: bigint | boolean | number) =>
    (typeof value === "boolean" ? BigInt(value ? 1 : 0) : BigInt(value))
      .toString(16)
      .padStart(64, "0");
  return {
    topics: [TOPIC0, `0x${"0".repeat(24)}${minter.slice(2)}`, `0x${word(tokenId)}`],
    data: `0x${word(free)}${word(paid)}`,
    blockNumber: "0x8604c18",
    transactionHash: `0x${"ab".repeat(32)}`,
  };
}

describe("log windowing", () => {
  it("splits an exact multiple", () => {
    expect(planLogWindows(0n, 99n, 50n)).toEqual([
      { fromBlock: 0n, toBlock: 49n },
      { fromBlock: 50n, toBlock: 99n },
    ]);
  });

  it("keeps the remainder in a short final window", () => {
    expect(planLogWindows(100n, 180n, 50n)).toEqual([
      { fromBlock: 100n, toBlock: 149n },
      { fromBlock: 150n, toBlock: 180n },
    ]);
  });

  it("handles a single block range", () => {
    expect(planLogWindows(7n, 7n, 50n)).toEqual([{ fromBlock: 7n, toBlock: 7n }]);
  });

  it("covers a range larger than one public RPC allows", () => {
    const windows = planLogWindows(140503064n, 140574865n, 50_000n);
    expect(windows).toHaveLength(2);
    expect(windows[0].fromBlock).toBe(140503064n);
    expect(windows.at(-1)!.toBlock).toBe(140574865n);
    // contiguous, no gaps and no overlap
    for (let i = 1; i < windows.length; i++) {
      expect(windows[i].fromBlock).toBe(windows[i - 1].toBlock + 1n);
    }
  });

  it("returns nothing when the range is inverted", () => {
    expect(planLogWindows(10n, 5n, 50n)).toEqual([]);
  });

  it("refuses a zero window", () => {
    expect(() => planLogWindows(0n, 10n, 0n)).toThrow();
  });
});

describe("mint event decoding", () => {
  it("reads token id, minter, free flag and price", () => {
    const event = decodeMintEvent(
      mintLog(3, "0x14970F118EF38850eB16081DC14D28754ff4576E", true, 0n),
      TOPIC0,
    );
    expect(event).toEqual({
      tokenId: 3,
      minter: "0x14970F118EF38850eB16081DC14D28754ff4576E",
      freeMint: true,
      pricePaid: 0n,
      blockNumber: 140528664, // 0x8604c18
      transactionHash: `0x${"ab".repeat(32)}`,
    });
  });

  it("reads a paid mint", () => {
    const event = decodeMintEvent(
      mintLog(1_001, "0xfDb99F4222364d027aF456658663ae35D8b67296", false, 1_000_000_000_000_000n),
      TOPIC0,
    );
    expect(event?.freeMint).toBe(false);
    expect(event?.pricePaid).toBe(1_000_000_000_000_000n);
  });

  it("ignores logs from another event", () => {
    const log = mintLog(1, "0xfDb99F4222364d027aF456658663ae35D8b67296", true, 0n);
    const wrongTopic = { ...log, topics: [`0x${"11".repeat(32)}`, ...log.topics.slice(1)] };
    expect(decodeMintEvent(wrongTopic, TOPIC0)).toBeNull();
  });

  it("ignores truncated logs", () => {
    const log = mintLog(1, "0xfDb99F4222364d027aF456658663ae35D8b67296", true, 0n);
    expect(decodeMintEvent({ ...log, topics: log.topics.slice(0, 2) }, TOPIC0)).toBeNull();
    expect(decodeMintEvent({ ...log, data: "0x" }, TOPIC0)).toBeNull();
  });
});

describe("gallery paging", () => {
  it("starts from the newest token", () => {
    expect(galleryWindow(4, 1, 24)).toEqual({ firstId: 4, lastId: 1 });
    expect(windowTokenIds(galleryWindow(4, 1, 24)!)).toEqual([4, 3, 2, 1]);
  });

  it("walks backwards page by page", () => {
    expect(galleryWindow(30, 2, 24)).toEqual({ firstId: 6, lastId: 1 });
    expect(galleryWindow(50, 2, 24)).toEqual({ firstId: 26, lastId: 3 });
  });

  it("returns null past the first token", () => {
    expect(galleryWindow(4, 2, 24)).toBeNull();
    expect(galleryWindow(0, 1, 24)).toBeNull();
  });

  it("clamps the last page instead of reading below token 1", () => {
    expect(galleryWindow(50, 3, 24)).toEqual({ firstId: 2, lastId: 1 });
  });
});

describe("bounded concurrency", () => {
  it("preserves input order", async () => {
    const result = await mapLimit([1, 2, 3, 4, 5], 2, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, value % 2 === 0 ? 5 : 1));
      return value * 10;
    });
    expect(result).toEqual([10, 20, 30, 40, 50]);
  });

  it("never exceeds the concurrency ceiling", async () => {
    let active = 0;
    let peak = 0;
    await mapLimit(Array.from({ length: 12 }, (_, index) => index), 3, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return true;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("handles an empty input", async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
  });
});

describe("relative time", () => {
  const now = 1_800_000_000;
  it("describes recent mints", () => {
    expect(relativeTime(now - 10, now)).toBe("just now");
    expect(relativeTime(now - 600, now)).toBe("10 min ago");
    expect(relativeTime(now - 7_200, now)).toBe("2 h ago");
    expect(relativeTime(now - 259_200, now)).toBe("3 d ago");
  });

  it("never reports negative time", () => {
    expect(relativeTime(now + 500, now)).toBe("just now");
  });
});
