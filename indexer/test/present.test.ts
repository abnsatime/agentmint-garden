import { describe, expect, it } from "vitest";
import {
  toActivityView,
  toListingView,
  toMintView,
  toSaleView,
  toTokenSummary,
  toTransferView,
} from "../src/api/present.js";

const OWNER = "0xF040275C3e38Cb018C491BC8a5A5437D86178A67";
const OTHER = "0x9d37af653d523ddBcA1113ED44AC7590b0986020";
const AT = new Date("2026-11-04T02:35:18.000Z");

describe("token summary", () => {
  it("maps a row with a mint", () => {
    expect(
      toTokenSummary({
        token_id: "7",
        owner: OWNER,
        minter: OWNER,
        free_mint: true,
        price_paid_wei: "0",
        mint_block: "140686449",
        mint_time: AT.toISOString(),
        meta_name: null,
        meta_image: null,
        meta_traits: null,
      }),
    ).toEqual({
      tokenId: "7",
      owner: OWNER,
      mintedBy: OWNER,
      mintedAt: AT.toISOString(),
      freeMint: true,
      pricePaidWei: "0",
      metadata: null,
    });
  });

  it("keeps nulls when the mint has not been indexed", () => {
    const summary = toTokenSummary({
      token_id: "8",
      owner: OWNER,
      minter: null,
      free_mint: null,
      price_paid_wei: null,
      mint_block: null,
      mint_time: null,
      meta_name: null,
      meta_image: null,
      meta_traits: null,
    });

    expect(summary.mintedBy).toBeNull();
    expect(summary.mintedAt).toBeNull();
    expect(summary.freeMint).toBeNull();
    expect(summary.metadata).toBeNull();
  });
});

describe("transfers", () => {
  it("maps a row and formats the timestamp", () => {
    expect(
      toTransferView({
        from_address: "0x0000000000000000000000000000000000000000",
        to_address: OWNER,
        block_number: "140548451",
        log_index: 3,
        tx_hash: "0xaa",
        block_time: AT.toISOString(),
      }),
    ).toEqual({
      from: "0x0000000000000000000000000000000000000000",
      to: OWNER,
      blockNumber: "140548451",
      logIndex: 3,
      txHash: "0xaa",
      blockTime: AT.toISOString(),
    });
  });
});

describe("mint, listing and sale", () => {
  it("maps a mint", () => {
    expect(
      toMintView({
        minter: OWNER,
        free_mint: false,
        price_paid_wei: "1000000000000000",
        block_number: "140600000",
        tx_hash: "0xbb",
        block_time: AT.toISOString(),
      }),
    ).toEqual({
      minter: OWNER,
      freeMint: false,
      pricePaidWei: "1000000000000000",
      blockNumber: "140600000",
      txHash: "0xbb",
      blockTime: AT.toISOString(),
    });
  });

  it("maps a listing with its price as a string", () => {
    expect(
      toListingView({
        token_id: "5",
        seller: OWNER,
        price_wei: "1538461538461539",
        block_number: "140692379",
        block_time: AT.toISOString(),
        meta_name: null,
        meta_image: null,
        meta_traits: null,
      }),
    ).toEqual({
      tokenId: "5",
      seller: OWNER,
      priceWei: "1538461538461539",
      sinceBlock: "140692379",
      sinceTime: AT.toISOString(),
      metadata: null,
    });
  });

  it("maps a sale including the log index", () => {
    expect(
      toSaleView({
        token_id: "5",
        seller: OWNER,
        buyer: OTHER,
        price_wei: "1538461538461539",
        block_number: "140692464",
        log_index: 2,
        tx_hash: "0xcc",
        block_time: AT.toISOString(),
      }),
    ).toMatchObject({ tokenId: "5", buyer: OTHER, blockNumber: "140692464", logIndex: 2 });
  });
});

describe("activity direction", () => {
  const row = {
    token_id: "5",
    from_address: "0x0000000000000000000000000000000000000000",
    to_address: OWNER,
    block_number: "140589681",
    log_index: 0,
    tx_hash: "0xdd",
    block_time: AT.toISOString(),
  };

  it("reads a mint as inbound, with the zero address as the counterparty", () => {
    expect(toActivityView(row, OWNER)).toMatchObject({
      direction: "in",
      tokenId: "5",
      counterparty: "0x0000000000000000000000000000000000000000",
    });
  });

  it("reads an outgoing transfer as out", () => {
    expect(toActivityView({ ...row, from_address: OWNER, to_address: OTHER }, OWNER)).toMatchObject({
      direction: "out",
      counterparty: OTHER,
    });
  });

  it("matches the owner case-insensitively", () => {
    expect(toActivityView(row, OWNER.toLowerCase())).toMatchObject({ direction: "in" });
  });
});
