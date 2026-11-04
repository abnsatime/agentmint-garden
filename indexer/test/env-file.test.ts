import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyDotEnv, loadDotEnv, parseDotEnv } from "../src/env-file.js";

describe("parsing .env content", () => {
  it("reads plain assignments", () => {
    expect(parseDotEnv("A=1\nB=two\n")).toEqual({ A: "1", B: "two" });
  });

  it("ignores comments and blank lines", () => {
    expect(parseDotEnv("# a comment\n\n   \nA=1\n   # indented comment\n")).toEqual({ A: "1" });
  });

  it("strips surrounding quotes", () => {
    expect(parseDotEnv(`A="quoted value"\nB='single'\n`)).toEqual({ A: "quoted value", B: "single" });
  });

  it("keeps an inline comment out of the value", () => {
    expect(parseDotEnv("RPC=https://example.org # the endpoint\n")).toEqual({
      RPC: "https://example.org",
    });
  });

  it("keeps URLs with slashes and colons intact", () => {
    const url = "postgres://garden:garden@127.0.0.1:5432/garden";
    expect(parseDotEnv(`DATABASE_URL=${url}\n`)).toEqual({ DATABASE_URL: url });
  });

  it("accepts the export prefix", () => {
    expect(parseDotEnv("export A=1\n")).toEqual({ A: "1" });
  });
});

describe("applying values", () => {
  it("fills only the gaps", () => {
    const target = { B: "from-environment" };
    const applied = applyDotEnv({ A: "1", B: "from-file" }, target);

    expect(target).toEqual({ A: "1", B: "from-environment" });
    expect(applied).toEqual(["A"]);
  });

  it("reports nothing when the environment is already complete", () => {
    expect(applyDotEnv({ A: "1" }, { A: "x" })).toEqual([]);
  });
});

describe("loading from a file", () => {
  it("returns an empty result when the file is missing", () => {
    expect(loadDotEnv("/definitely/not/here/.env")).toEqual([]);
  });

  it("reads a temporary file", () => {
    const directory = mkdtempSync(join(tmpdir(), "ix-env-"));
    const path = join(directory, ".env");
    writeFileSync(path, "CHAIN_ID=97\nGARDEN_ADDRESS=0xabc\n", "utf8");

    const target: Record<string, string | undefined> = {};
    expect(loadDotEnv(path, target).sort()).toEqual(["CHAIN_ID", "GARDEN_ADDRESS"]);
    expect(target.CHAIN_ID).toBe("97");
  });
});
