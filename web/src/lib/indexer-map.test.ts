import { describe, expect, it } from "vitest";
import {
  toActivityItem,
  toGalleryItem,
  toGalleryMint,
  toHoldings,
  toMarketItem,
  toSeconds,
} from "./indexer-map";
import type { IndexActivity, IndexListing, IndexToken } from "./indexer";

const OWNER = "0xF040275C3e38Cb018C491BC8a5A5437D86178A67";
const OTHER = "0x9d37af653d523ddBcA1113ED44AC7590b0986020";
const ZERO = "0x0000000000000000000000000000000000000000";
const ISO = "2026-11-04T02:35:18.000Z";

function token(overrides: Partial<IndexToken> = {}): IndexToken {
  return {
    tokenId: "7",
    owner: OWNER,
    mintedBy: OWNER,
    mintedAt: ISO,
    freeMint: true,
    pricePaidWei: "0",
    mintedTxHash: "0xaa",
    metadata: {
      name: "AgentMint Garden #7",
      image: "data:image/svg+xml;base64,AAA",
      traits: [{ trait_type: "Hue", value: "296" }],
    },
    ...overrides,
  };
}

function activity(overrides: Partial<IndexActivity> = {}): IndexActivity {
  return {
    direction: "in",
    tokenId: "7",
    counterparty: ZERO,
    blockNumber: "140686449",
    logIndex: 0,
    txHash: "0xaa",
    blockTime: ISO,
    freeMint: true,
    pricePaidWei: "0",
    ...overrides,
  };
}

describe("timestamps", () => {
  it("converts ISO to seconds", () => {
    expect(toSeconds(ISO)).toBe(Math.round(Date.parse(ISO) / 1000));
  });

  it("returns undefined for missing or broken input", () => {
    expect(toSeconds(null)).toBeUndefined();
    expect(toSeconds("")).toBeUndefined();
    expect(toSeconds("not a date")).toBeUndefined();
  });
});

describe("gallery mapping", () => {
  it("uses the indexed name and artwork", () => {
    expect(toGalleryItem(token())).toEqual({
      tokenId: 7,
      owner: OWNER,
      name: "AgentMint Garden #7",
      image: "data:image/svg+xml;base64,AAA",
      hue: "296",
    });
  });

  it("falls back when metadata is still missing", () => {
    expect(toGalleryItem(token({ metadata: null }))).toEqual({
      tokenId: 7,
      owner: OWNER,
      name: "GARDEN #7",
      image: undefined,
      hue: undefined,
    });
  });

  it("maps provenance with the mint transaction", () => {
    expect(toGalleryMint(token())).toMatchObject({
      tokenId: 7,
      minter: OWNER,
      freeMint: true,
      transactionHash: "0xaa",
    });
    expect(toGalleryMint(token())?.timestamp).toBe(Math.round(Date.parse(ISO) / 1000));
  });

  it("has no provenance without a minter", () => {
    expect(toGalleryMint(token({ mintedBy: null }))).toBeNull();
  });
});

describe("market mapping", () => {
  it("turns a listing into the card shape", () => {
    const listing: IndexListing = {
      tokenId: "5",
      seller: OWNER,
      priceWei: "1538461538461539",
      sinceBlock: "140692379",
      sinceTime: ISO,
      metadata: token().metadata,
    };

    expect(toMarketItem(listing)).toEqual({
      tokenId: 5,
      seller: OWNER,
      price: 1538461538461539n,
      sinceBlock: 140692379,
      name: "AgentMint Garden #7",
      image: "data:image/svg+xml;base64,AAA",
      traits: [{ trait_type: "Hue", value: "296" }],
    });
  });
});

describe("activity mapping", () => {
  it("reads a zero-address inbound as a mint", () => {
    expect(toActivityItem(activity())).toMatchObject({
      kind: "mint",
      tokenId: 7,
      freeMint: true,
      pricePaid: 0n,
    });
  });

  it("reads an ordinary inbound as a receipt, with no mint fields", () => {
    const item = toActivityItem(
      activity({ counterparty: OTHER, freeMint: null, pricePaidWei: null }),
    );

    expect(item).toMatchObject({ kind: "in", counterparty: OTHER });
    expect(item.freeMint).toBeUndefined();
    expect(item.pricePaid).toBeUndefined();
  });

  it("reads an outbound transfer", () => {
    expect(toActivityItem(activity({ direction: "out", counterparty: OTHER }))).toMatchObject({
      kind: "out",
      counterparty: OTHER,
    });
  });

  it("keeps the timestamp", () => {
    expect(toActivityItem(activity()).timestamp).toBe(Math.round(Date.parse(ISO) / 1000));
  });
});

describe("holdings mapping", () => {
  it("uses the newest inbound transfer as the acquisition", () => {
    const holders = toHoldings(
      [token({ tokenId: "7" })],
      [
        activity({ blockNumber: "100", txHash: "0xold" }),
        activity({ blockNumber: "200", txHash: "0xnew" }),
        activity({ direction: "out", blockNumber: "300", txHash: "0xout" }),
      ],
    );

    expect(holders).toEqual([
      {
        tokenId: 7,
        acquiredTx: "0xnew",
        acquiredBlock: 200,
        from: ZERO as `0x${string}`,
        mintedHere: true,
        acquiredAt: Math.round(Date.parse(ISO) / 1000),
      },
    ]);
  });

  it("marks a token as not minted here when the owner differs from the minter", () => {
    const holders = toHoldings([token({ owner: OTHER })], []);
    expect(holders[0]).toMatchObject({ mintedHere: false, acquiredTx: "", acquiredBlock: 0 });
  });
});
