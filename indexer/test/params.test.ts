import { describe, expect, it } from "vitest";
import {
  BadRequest,
  parseAddress,
  parseLimit,
  parsePositionCursor,
  parsePriceCursor,
  parseTokenCursor,
  parseTokenId,
} from "../src/api/params.js";

describe("limit", () => {
  it("falls back when absent", () => {
    expect(parseLimit(undefined)).toBe(50);
    expect(parseLimit("")).toBe(50);
    expect(parseLimit(undefined, { fallback: 100 })).toBe(100);
  });

  it("accepts a positive integer", () => {
    expect(parseLimit("1")).toBe(1);
    expect(parseLimit("37")).toBe(37);
  });

  it("clamps to the maximum instead of failing", () => {
    expect(parseLimit("10000")).toBe(200);
    expect(parseLimit("10000", { max: 500 })).toBe(500);
  });

  it("rejects nonsense", () => {
    expect(() => parseLimit("0")).toThrow(BadRequest);
    expect(() => parseLimit("-5")).toThrow(BadRequest);
    expect(() => parseLimit("2.5")).toThrow(BadRequest);
    expect(() => parseLimit("many")).toThrow(BadRequest);
    expect(() => parseLimit(["1", "2"])).toThrow(BadRequest);
  });
});

describe("owner", () => {
  it("accepts an address in any case and normalises it", () => {
    const checksummed = "0xF040275C3e38Cb018C491BC8a5A5437D86178A67";
    expect(parseAddress(checksummed.toLowerCase())).toBe(checksummed);
    expect(parseAddress(checksummed)).toBe(checksummed);
    expect(parseAddress(checksummed.toUpperCase().replace("0X", "0x"))).toBe(checksummed);
    // A wrong EIP-55 checksum is still the same address; only the shape is validated.
    expect(parseAddress("0xF040275C3e38Cb018C491BC8A5A5437D86178A67")).toBe(checksummed);
  });

  it("returns null when absent", () => {
    expect(parseAddress(undefined)).toBeNull();
    expect(parseAddress("")).toBeNull();
  });

  it("rejects something that is not an address", () => {
    expect(() => parseAddress("0x1234")).toThrow(BadRequest);
    expect(() => parseAddress("not-an-address")).toThrow(BadRequest);
  });

  it("names the parameter in the message", () => {
    try {
      parseAddress("nope", "seller");
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as BadRequest).message).toContain("seller");
      expect((error as BadRequest).parameter).toBe("seller");
    }
  });
});

describe("token id", () => {
  it("parses a decimal id", () => {
    expect(parseTokenId("7")).toBe(7n);
    expect(parseTokenId("0")).toBe(0n);
  });

  it("rejects anything else", () => {
    expect(() => parseTokenId("0x7")).toThrow(BadRequest);
    expect(() => parseTokenId("-1")).toThrow(BadRequest);
    expect(() => parseTokenId("1.5")).toThrow(BadRequest);
    expect(() => parseTokenId(undefined)).toThrow(BadRequest);
  });
});

describe("position cursor", () => {
  it("parses block and log index", () => {
    expect(parsePositionCursor("140692464:1")).toEqual({ blockNumber: 140692464n, logIndex: 1 });
  });

  it("returns null when absent", () => {
    expect(parsePositionCursor(undefined)).toBeNull();
    expect(parsePositionCursor("")).toBeNull();
  });

  it("rejects a malformed cursor", () => {
    expect(() => parsePositionCursor("140692464")).toThrow(BadRequest);
    expect(() => parsePositionCursor("a:b")).toThrow(BadRequest);
    expect(() => parsePositionCursor("1:2:3")).toThrow(BadRequest);
    expect(() => parsePositionCursor("-1:0")).toThrow(BadRequest);
  });
});

describe("price cursor", () => {
  it("parses price and token", () => {
    expect(parsePriceCursor("1538461538461539:5")).toEqual({
      priceWei: 1538461538461539n,
      tokenId: 5n,
    });
  });

  it("rejects a malformed cursor", () => {
    expect(() => parsePriceCursor("1538461538461539")).toThrow(BadRequest);
    expect(() => parsePriceCursor(":5")).toThrow(BadRequest);
    expect(() => parsePriceCursor("x:5")).toThrow(BadRequest);
  });
});

describe("token cursor", () => {
  it("parses an id", () => {
    expect(parseTokenCursor("5")).toBe(5n);
  });

  it("returns null when absent", () => {
    expect(parseTokenCursor(undefined)).toBeNull();
  });

  it("rejects a malformed cursor", () => {
    expect(() => parseTokenCursor("five")).toThrow(BadRequest);
    expect(() => parseTokenCursor("5:1")).toThrow(BadRequest);
  });
});
