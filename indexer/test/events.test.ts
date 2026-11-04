import { describe, expect, it } from "vitest";
import {
  GARDEN_MINTED_TOPIC,
  MARKET_TOPICS,
  MARKET_TOPIC_LIST,
  TRANSFER_TOPIC,
  decodeGardenMint,
  decodeMarketEvent,
  decodeTransfer,
  type RawLog,
} from "../src/sync/events.js";

const SELLER = "0xF040275C3e38Cb018C491BC8a5A5437D86178A67";
const BUYER = "0x9d37af653d523ddBcA1113ED44AC7590b0986020";
const ZERO = "0x0000000000000000000000000000000000000000";

function word(value: bigint | number) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function topicOf(address: string) {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function log(topics: string[], data: string, block = 100, logIndex = 0): RawLog {
  return {
    topics,
    data,
    blockNumber: `0x${block.toString(16)}`,
    transactionHash: `0x${"ab".repeat(32)}`,
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

describe("garden mints", () => {
  it("decodes a free mint", () => {
    const event = decodeGardenMint(
      log([GARDEN_MINTED_TOPIC, topicOf(SELLER), `0x${word(7)}`], `0x${word(1)}${word(0)}`),
    );
    expect(event).toEqual({
      tokenId: 7n,
      minter: SELLER,
      freeMint: true,
      pricePaidWei: 0n,
      blockNumber: 100n,
      logIndex: 0,
      txHash: `0x${"ab".repeat(32)}`,
    });
  });

  it("decodes a paid mint", () => {
    const event = decodeGardenMint(
      log(
        [GARDEN_MINTED_TOPIC, topicOf(SELLER), `0x${word(1_001)}`],
        `0x${word(0)}${word(1_000_000_000_000_000n)}`,
      ),
    );
    expect(event?.freeMint).toBe(false);
    expect(event?.pricePaidWei).toBe(1_000_000_000_000_000n);
  });

  it("ignores another event and truncated data", () => {
    expect(decodeGardenMint(log([TRANSFER_TOPIC, topicOf(SELLER), topicOf(BUYER)], "0x"))).toBeNull();
    expect(
      decodeGardenMint(log([GARDEN_MINTED_TOPIC, topicOf(SELLER), `0x${word(1)}`], "0x")),
    ).toBeNull();
  });
});

describe("transfers", () => {
  it("decodes a mint transfer", () => {
    const event = decodeTransfer(
      log([TRANSFER_TOPIC, topicOf(ZERO), topicOf(SELLER), `0x${word(5)}`], "0x"),
    );
    expect(event).toMatchObject({ tokenId: 5n, from: ZERO, to: SELLER });
  });

  it("decodes a resale", () => {
    const event = decodeTransfer(
      log([TRANSFER_TOPIC, topicOf(SELLER), topicOf(BUYER), `0x${word(5)}`], "0x", 200, 3),
    );
    expect(event).toMatchObject({ from: SELLER, to: BUYER, blockNumber: 200n, logIndex: 3 });
  });

  it("ignores a log with too few topics", () => {
    expect(decodeTransfer(log([TRANSFER_TOPIC, topicOf(ZERO)], "0x"))).toBeNull();
  });
});

describe("market events", () => {
  it("decodes a listing with its price", () => {
    const event = decodeMarketEvent(
      log(
        [MARKET_TOPICS.listed, `0x${word(5)}`, topicOf(SELLER)],
        `0x${word(1_538_461_538_461_539n)}`,
      ),
    );
    expect(event).toEqual({
      kind: "listed",
      tokenId: 5n,
      seller: SELLER,
      priceWei: 1_538_461_538_461_539n,
      blockNumber: 100n,
      logIndex: 0,
      txHash: `0x${"ab".repeat(32)}`,
    });
  });

  it("decodes a price update", () => {
    const event = decodeMarketEvent(
      log([MARKET_TOPICS.priceUpdated, `0x${word(5)}`, topicOf(SELLER)], `0x${word(99n)}`),
    );
    expect(event?.kind).toBe("price_updated");
    expect(event?.priceWei).toBe(99n);
  });

  it("decodes a cancellation", () => {
    const event = decodeMarketEvent(
      log([MARKET_TOPICS.cancelled, `0x${word(5)}`, topicOf(SELLER)], "0x"),
    );
    expect(event).toMatchObject({ kind: "cancelled", tokenId: 5n, seller: SELLER });
  });

  it("decodes a sale with seller and buyer", () => {
    const event = decodeMarketEvent(
      log(
        [MARKET_TOPICS.sold, `0x${word(5)}`, topicOf(SELLER), topicOf(BUYER)],
        `0x${word(1_538_461_538_461_539n)}`,
      ),
    );
    expect(event).toMatchObject({
      kind: "sold",
      seller: SELLER,
      buyer: BUYER,
      priceWei: 1_538_461_538_461_539n,
    });
  });

  it("ignores an unknown topic", () => {
    expect(decodeMarketEvent(log([TRANSFER_TOPIC, `0x${word(1)}`], "0x"))).toBeNull();
  });

  it("exposes all four topics for a single scan", () => {
    expect(MARKET_TOPIC_LIST).toHaveLength(4);
    expect(new Set(MARKET_TOPIC_LIST).size).toBe(4);
  });
});
