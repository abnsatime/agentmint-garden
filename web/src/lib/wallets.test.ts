import { describe, expect, it } from "vitest";
import { shouldAskForWallet } from "./wallets";

describe("wallet picker policy", () => {
  it("asks when several wallets are installed", () => {
    expect(shouldAskForWallet([{ name: "Binance Wallet" }, { name: "MetaMask" }])).toBe(true);
  });

  it("connects straight away for one named wallet", () => {
    expect(shouldAskForWallet([{ name: "Binance Wallet" }])).toBe(false);
    expect(shouldAskForWallet([{ name: "MetaMask" }])).toBe(false);
  });

  it("asks for a generic injected connector, because the name hides the choice", () => {
    expect(shouldAskForWallet([{ name: "Injected" }])).toBe(true);
  });

  it("asks when nothing is installed", () => {
    expect(shouldAskForWallet([])).toBe(true);
  });

  it("ignores casing", () => {
    expect(shouldAskForWallet([{ name: "INJECTED" }])).toBe(true);
  });
});
