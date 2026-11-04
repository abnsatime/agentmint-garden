import { describe, expect, it } from "vitest";
import { showFooterDiagnostics } from "./flags";

describe("debug flag", () => {
  it("shows the footer state line only in a debug build", () => {
    expect(showFooterDiagnostics(true, true)).toBe(true);
  });

  it("stays hidden on a page that did not ask for it", () => {
    expect(showFooterDiagnostics(false, true)).toBe(false);
  });

  it("stays hidden in a normal build even when the page asks", () => {
    expect(showFooterDiagnostics(true, false)).toBe(false);
    expect(showFooterDiagnostics(false, false)).toBe(false);
  });
});
