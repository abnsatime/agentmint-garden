import { describe, expect, it } from "vitest";
import { decodeTokenUri } from "../src/sync/token-uri.js";

function dataUri(document: unknown): string {
  return `data:application/json;base64,${Buffer.from(JSON.stringify(document), "utf8").toString("base64")}`;
}

describe("token uri decoding", () => {
  it("reads a base64 data uri", () => {
    const uri = dataUri({
      name: "AgentMint Garden #7",
      image: "data:image/svg+xml;base64,PHN2Zy8+",
      attributes: [
        { trait_type: "hue", value: "186" },
        { trait_type: "phase", value: "free" },
      ],
    });

    expect(decodeTokenUri(uri)).toEqual({
      name: "AgentMint Garden #7",
      image: "data:image/svg+xml;base64,PHN2Zy8+",
      traits: [
        { trait_type: "hue", value: "186" },
        { trait_type: "phase", value: "free" },
      ],
    });
  });

  it("reads a percent-encoded data uri", () => {
    const uri = `data:application/json,${encodeURIComponent(JSON.stringify({ name: "Garden #1" }))}`;
    expect(decodeTokenUri(uri)).toEqual({ name: "Garden #1", traits: [] });
  });

  it("keeps a numeric trait value as a string", () => {
    const uri = dataUri({ name: "Garden #2", attributes: [{ trait_type: "hue", value: 42 }] });
    expect(decodeTokenUri(uri)?.traits).toEqual([{ trait_type: "hue", value: "42" }]);
  });

  it("returns null for a document without a name", () => {
    expect(decodeTokenUri(dataUri({ image: "x" }))).toBeNull();
  });

  it("returns null for broken base64", () => {
    expect(decodeTokenUri("data:application/json;base64,!!!not-base64!!!")).toBeNull();
  });

  it("returns null for a non-data uri", () => {
    expect(decodeTokenUri("https://example.org/1.json")).toBeNull();
  });

  it("returns null for junk input", () => {
    expect(decodeTokenUri("")).toBeNull();
    expect(decodeTokenUri(undefined as unknown as string)).toBeNull();
  });

  it("ignores malformed attributes", () => {
    const uri = dataUri({ name: "Garden #3", attributes: [{ nope: true }, { trait_type: "hue" }] });
    expect(decodeTokenUri(uri)?.traits).toEqual([]);
  });
});
