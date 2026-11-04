import { describe, expect, it } from "vitest";
import type { RawLog } from "../src/sync/events.js";
import { GARDEN_MINTED_TOPIC, MARKET_TOPICS, TRANSFER_TOPIC } from "../src/sync/events.js";
import { collectGardenRows, collectMarketRows, countPending, emptyPending } from "../src/sync/rows.js";

const SELLER = "0xF040275C3e38Cb018C491BC8a5A5437D86178A67";
const BUYER = "0x9d37af653d523ddBcA1113ED44AC7590b0986020";
const ZERO = "0x0000000000000000000000000000000000000000";
const AT = new Date("2026-11-04T00:00:00.000Z");

function word(value: bigint | number) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function topicOf(address: string) {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function log(topics: string[], data: string, block: number, logIndex = 0): RawLog {
  return {
    topics,
    data,
    blockNumber: `0x${block.toString(16)}`,
    transactionHash: `0x${"ab".repeat(32)}`,
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

const at = (block: bigint) => {
  if (block !== 100n && block !== 101n) throw new Error(`unexpected block ${block}`);
  return AT;
};

describe("garden rows", () => {
  it("turns a mint into a row with a timestamp", () => {
    const events = collectGardenRows(
      [log([GARDEN_MINTED_TOPIC, topicOf(SELLER), `0x${word(7)}`], `0x${word(1)}${word(0)}`, 100)],
      at,
    );

    expect(events.mints).toEqual([
      {
        tokenId: 7n,
        minter: SELLER,
        freeMint: true,
        pricePaidWei: "0",
        blockNumber: 100n,
        logIndex: 0,
        txHash: `0x${"ab".repeat(32)}`,
        blockTime: AT,
      },
    ]);
    expect(events.transfers).toEqual([]);
    expect(countPending(events)).toBe(1);
  });

  it("keeps the paid price as a decimal string", () => {
    const events = collectGardenRows(
      [
        log(
          [GARDEN_MINTED_TOPIC, topicOf(SELLER), `0x${word(1001)}`],
          `0x${word(0)}${word(1_000_000_000_000_000n)}`,
          100,
        ),
      ],
      at,
    );

    expect(events.mints[0]?.pricePaidWei).toBe("1000000000000000");
    expect(events.mints[0]?.freeMint).toBe(false);
  });

  it("turns a transfer into a row", () => {
    const events = collectGardenRows(
      [log([TRANSFER_TOPIC, topicOf(ZERO), topicOf(SELLER), `0x${word(5)}`], "0x", 101, 2)],
      at,
    );

    expect(events.transfers).toEqual([
      {
        tokenId: 5n,
        fromAddress: ZERO,
        toAddress: SELLER,
        blockNumber: 101n,
        logIndex: 2,
        txHash: `0x${"ab".repeat(32)}`,
        blockTime: AT,
      },
    ]);
  });

  it("ignores a log it does not recognise", () => {
    const events = collectGardenRows(
      [log([MARKET_TOPICS.listed, `0x${word(1)}`, topicOf(SELLER)], `0x${word(1)}`, 100)],
      at,
    );
    expect(countPending(events)).toBe(0);
  });

  it("starts from empty collections", () => {
    expect(emptyPending()).toEqual({ mints: [], transfers: [], market: [] });
  });
});

describe("market rows", () => {
  it("stores a listing with its price", () => {
    const events = collectMarketRows(
      [log([MARKET_TOPICS.listed, `0x${word(5)}`, topicOf(SELLER)], `0x${word(1538n)}`, 100)],
      at,
    );

    expect(events.market[0]).toMatchObject({
      kind: "listed",
      tokenId: 5n,
      seller: SELLER,
      buyer: null,
      priceWei: "1538",
    });
  });

  it("stores a sale with buyer and price", () => {
    const events = collectMarketRows(
      [
        log(
          [MARKET_TOPICS.sold, `0x${word(5)}`, topicOf(SELLER), topicOf(BUYER)],
          `0x${word(99n)}`,
          101,
          4,
        ),
      ],
      at,
    );

    expect(events.market[0]).toMatchObject({
      kind: "sold",
      buyer: BUYER,
      priceWei: "99",
      logIndex: 4,
    });
  });

  it("stores a cancellation without a price", () => {
    const events = collectMarketRows(
      [log([MARKET_TOPICS.cancelled, `0x${word(5)}`, topicOf(SELLER)], "0x", 100)],
      at,
    );

    expect(events.market[0]).toMatchObject({ kind: "cancelled", priceWei: null, buyer: null });
  });

  it("skips a garden log", () => {
    const events = collectMarketRows(
      [log([TRANSFER_TOPIC, topicOf(ZERO), topicOf(SELLER), `0x${word(5)}`], "0x", 100)],
      at,
    );
    expect(events.market).toEqual([]);
  });
});
