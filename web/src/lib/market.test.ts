import { describe, expect, it } from "vitest";
import {
  MARKET_TOPICS,
  decodeMarketError,
  decodeMarketEvent,
  deriveListings,
  describePrice,
  formatUsd,
  randomListingOf,
  sortListings,
  suggestFloorPrice,
  tbnbToUsd,
  usdToTbnb,
  type MarketEvent,
  type RawMarketLog,
} from "./market";

const SELLER = "0xF040275C3e38Cb018C491BC8a5A5437D86178A67" as const;
const BUYER = "0x9d37af653d523ddBcA1113ED44AC7590b0986020" as const;

function word(value: bigint | number) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function topicOf(address: string) {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

function rawLog(
  kind: keyof typeof MARKET_TOPICS,
  tokenId: number,
  extraTopic: string | undefined,
  price: bigint | undefined,
  block = 100,
  logIndex = 0,
): RawMarketLog {
  const topics = [MARKET_TOPICS[kind], `0x${word(tokenId)}`];
  if (extraTopic) topics.push(extraTopic);
  return {
    topics,
    data: price === undefined ? "0x" : `0x${word(price)}`,
    blockNumber: `0x${block.toString(16)}`,
    transactionHash: `0x${"ab".repeat(32)}`,
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

describe("market event decoding", () => {
  it("reads a listed event", () => {
    const event = decodeMarketEvent(rawLog("listed", 5, topicOf(SELLER), 1_500_000_000_000_000n));
    expect(event).toEqual({
      kind: "listed",
      tokenId: 5,
      seller: SELLER.toLowerCase(),
      price: 1_500_000_000_000_000n,
      blockNumber: 100,
      logIndex: 0,
      transactionHash: `0x${"ab".repeat(32)}`,
    });
  });

  it("reads a price update", () => {
    const event = decodeMarketEvent(rawLog("priceUpdated", 5, topicOf(SELLER), 2n));
    expect(event?.kind).toBe("price");
    expect(event?.price).toBe(2n);
  });

  it("reads a cancellation without a price", () => {
    const event = decodeMarketEvent(rawLog("cancelled", 7, topicOf(SELLER), undefined));
    expect(event).toEqual({
      kind: "cancelled",
      tokenId: 7,
      seller: SELLER.toLowerCase(),
      blockNumber: 100,
      logIndex: 0,
      transactionHash: `0x${"ab".repeat(32)}`,
    });
  });

  it("reads a sale with seller and buyer", () => {
    const log = rawLog("sold", 9, topicOf(SELLER), 3n);
    log.topics = [...log.topics, topicOf(BUYER)];
    const event = decodeMarketEvent(log);
    expect(event).toMatchObject({
      kind: "sold",
      tokenId: 9,
      seller: SELLER.toLowerCase(),
      buyer: BUYER.toLowerCase(),
      price: 3n,
    });
  });

  it("ignores an unrelated topic", () => {
    const log = rawLog("listed", 1, topicOf(SELLER), 1n);
    log.topics = [`0x${"11".repeat(32)}`, ...log.topics.slice(1)];
    expect(decodeMarketEvent(log)).toBeNull();
  });

  it("ignores a truncated log", () => {
    const log = rawLog("listed", 1, undefined, 1n);
    expect(decodeMarketEvent(log)).toBeNull();
  });
});

function event(kind: MarketEvent["kind"], tokenId: number, block: number, price?: bigint): MarketEvent {
  return {
    kind,
    tokenId,
    seller: SELLER,
    price,
    blockNumber: block,
    logIndex: 0,
    transactionHash: `0x${block.toString(16).padStart(8, "0")}`,
  };
}

describe("order book replay", () => {
  it("adds a listing", () => {
    const listings = deriveListings([event("listed", 5, 100, 1_000n)]);
    expect(listings).toEqual([{ tokenId: 5, seller: SELLER, price: 1_000n, sinceBlock: 100 }]);
  });

  it("applies a price change", () => {
    const listings = deriveListings([event("listed", 5, 100, 1_000n), event("price", 5, 110, 900n)]);
    expect(listings[0].price).toBe(900n);
  });

  it("removes a cancelled listing", () => {
    expect(deriveListings([event("listed", 5, 100, 1_000n), event("cancelled", 5, 120)])).toEqual([]);
  });

  it("removes a sold listing", () => {
    expect(deriveListings([event("listed", 5, 100, 1_000n), event("sold", 5, 130, 1_000n)])).toEqual([]);
  });

  it("sorts the input before replaying, so arrival order does not matter", () => {
    const listings = deriveListings([
      event("cancelled", 5, 120),
      event("listed", 5, 100, 1_000n),
      event("listed", 6, 105, 2_000n),
    ]);
    expect(listings.map((listing) => listing.tokenId)).toEqual([6]);
  });

  it("keeps independent tokens apart", () => {
    const listings = deriveListings([
      event("listed", 5, 100, 1_000n),
      event("listed", 6, 101, 2_000n),
      event("cancelled", 5, 110),
    ]);
    expect(listings.map((listing) => listing.tokenId)).toEqual([6]);
  });

  it("ignores a price change for something that is not listed", () => {
    expect(deriveListings([event("price", 5, 100, 700n)])).toEqual([]);
  });
});

describe("listing order and lookup", () => {
  const listings = [
    { tokenId: 3, seller: SELLER, price: 3_000n, sinceBlock: 10 },
    { tokenId: 1, seller: SELLER, price: 1_000n, sinceBlock: 12 },
    { tokenId: 2, seller: SELLER, price: 1_000n, sinceBlock: 11 },
  ];

  it("shows the cheapest first, oldest among equals", () => {
    expect(sortListings(listings).map((listing) => listing.tokenId)).toEqual([2, 1, 3]);
  });

  it("does not mutate the input", () => {
    const copy = [...listings];
    sortListings(listings);
    expect(listings).toEqual(copy);
  });

  it("finds a listing by token", () => {
    expect(randomListingOf(listings, 3)?.tokenId).toBe(3);
    expect(randomListingOf(listings, 99)).toBeUndefined();
  });
});

describe("price conversion", () => {
  it("turns tBNB into dollars", () => {
    expect(tbnbToUsd(1_000_000_000_000_000n, 650)).toBeCloseTo(0.65, 6);
    expect(tbnbToUsd(1_000_000_000_000_000_000n, 650)).toBe(650);
  });

  it("turns dollars into tBNB", () => {
    expect(usdToTbnb(650, 650)).toBe(1_000_000_000_000_000_000n);
    expect(usdToTbnb(1, 650)).toBe(1_538_461_538_461_539n);
  });

  it("suggests about one dollar as the default ask", () => {
    expect(formatUsd(tbnbToUsd(suggestFloorPrice(650), 650))).toBe("$1.00");
  });

  it("is defensive about a bad rate", () => {
    expect(tbnbToUsd(1n, 0)).toBe(0);
    expect(usdToTbnb(1, 0)).toBe(0n);
  });

  it("describes a price in both units", () => {
    expect(describePrice(1_538_461_538_461_539n, 650)).toEqual({
      tbnb: "0.001538461538461539",
      usd: "$1.00",
    });
  });

  it("formats small and large dollar amounts", () => {
    expect(formatUsd(0)).toBe("$0");
    expect(formatUsd(0.0042)).toBe("$0.0042");
    expect(formatUsd(0.42)).toBe("$0.420");
    expect(formatUsd(12.3456)).toBe("$12.35");
    expect(formatUsd(Number.NaN)).toBe("—");
  });
});

describe("market errors", () => {
  it("explains the common failures", () => {
    expect(decodeMarketError({ message: "MarketNotApproved" })).toContain("Approve the market");
    expect(decodeMarketError({ message: "MarketAlreadyListed" })).toContain("already listed");
    expect(decodeMarketError({ message: "MarketStaleListing" })).toContain("moved the token away");
    expect(decodeMarketError({ message: "MarketSelfPurchase" })).toContain("cannot buy your own");
    expect(decodeMarketError({ message: "MarketIncorrectPayment" })).toContain("price changed");
    expect(decodeMarketError({ code: 4001, message: "User rejected" })).toContain("rejected");
  });

  it("falls back to a neutral sentence", () => {
    expect(decodeMarketError({})).toContain("could not be completed");
  });
});
