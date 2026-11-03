import { describe, expect, it } from "vitest";
import { describeConnectError, detectWallets, shouldAskForWallet, uniqueConnectorsByName } from "./wallets";

function provider(flags: Record<string, boolean> = {}) {
  return { request: async () => null, ...flags };
}

/** The legacy BNB Beacon Chain wallet: no EIP-1193 `request`, so it cannot be typed as one. */
const legacyBinanceChain = { send: () => undefined, sendAsync: () => undefined } as never;

describe("wallet detection", () => {
  it("ignores the legacy BinanceChain object that has no request method", () => {
    const detected = detectWallets({
      ethereum: provider({ isMetaMask: true }),
      BinanceChain: legacyBinanceChain,
    });
    expect(detected.map((wallet) => wallet.name)).toEqual(["MetaMask"]);
  });

  it("returns nothing when the only injected object is legacy", () => {
    expect(detectWallets({ BinanceChain: legacyBinanceChain })).toEqual([]);
  });

  it("picks up the modern Binance Web3 Wallet object", () => {
    const detected = detectWallets({ binancew3w: provider() });
    expect(detected).toHaveLength(1);
    expect(detected[0].name).toBe("Binance Wallet");
  });

  it("splits a multi-wallet facade into named choices", () => {
    const metaMask = provider({ isMetaMask: true });
    const binance = provider({ isBinance: true });
    const detected = detectWallets({ ethereum: { providers: [metaMask, binance] } });
    expect(detected.map((wallet) => wallet.name)).toEqual(["Binance Wallet", "MetaMask"]);
  });

  it("leaves an unmarked provider to the generic fallback connector", () => {
    // Something answers on window.ethereum but advertises nothing, so it cannot be named.
    // walletConnectors() appends the generic injected connector for exactly this case.
    expect(detectWallets({ ethereum: provider() })).toEqual([]);
  });

  it("still detects a flagged provider next to an unmarked one", () => {
    const detected = detectWallets({
      ethereum: { providers: [provider(), provider({ isMetaMask: true })] },
    });
    expect(detected.map((wallet) => wallet.name)).toEqual(["MetaMask", "Browser wallet"]);
  });

  it("does not register the same provider twice", () => {
    const shared = provider({ isBinance: true });
    const detected = detectWallets({ ethereum: shared, binancew3w: shared, BinanceChain: shared });
    expect(detected).toHaveLength(1);
  });

  it("keeps Binance Wallet ahead of MetaMask when both exist", () => {
    const detected = detectWallets({
      ethereum: provider({ isMetaMask: true }),
      binancew3w: provider(),
    });
    expect(detected[0].name).toBe("Binance Wallet");
    expect(detected[1].name).toBe("MetaMask");
  });

  it("survives an empty host", () => {
    expect(detectWallets(null)).toEqual([]);
    expect(detectWallets({})).toEqual([]);
  });

  it("gives every candidate a unique id", () => {
    const detected = detectWallets({
      ethereum: { providers: [provider({ isMetaMask: true }), provider({ isTrust: true })] },
      okxwallet: provider(),
    });
    const ids = detected.map((wallet) => wallet.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("wallet picker policy", () => {
  it("asks when several wallets are installed", () => {
    expect(shouldAskForWallet([{ name: "Binance Wallet" }, { name: "MetaMask" }])).toBe(true);
  });

  it("connects straight away for one named wallet", () => {
    expect(shouldAskForWallet([{ name: "Binance Wallet" }])).toBe(false);
    expect(shouldAskForWallet([{ name: "Browser wallet" }])).toBe(false);
  });

  it("connects straight away through a lone generic connector", () => {
    // One connector means one wallet; the anonymous name gives no alternative to offer.
    expect(shouldAskForWallet([{ name: "Injected" }])).toBe(false);
  });

  it("does not ask when nothing is installed", () => {
    // The caller renders the no-wallet empty state instead of an empty picker.
    expect(shouldAskForWallet([])).toBe(false);
  });
});

describe("connect error copy", () => {
  it("explains a provider that is not EIP-1193", () => {
    const message = describeConnectError(new TypeError("o.request is not a function"));
    expect(message).toContain("does not expose the provider API");
  });

  it("explains a missing extension", () => {
    expect(describeConnectError(new Error("Provider not found."))).toContain(
      "No wallet extension was detected",
    );
  });

  it("explains a rejection", () => {
    expect(describeConnectError({ code: 4001, message: "User rejected" })).toContain(
      "closed the wallet request",
    );
  });

  it("falls back for anything else", () => {
    expect(describeConnectError({})).toBe("The wallet connection failed.");
  });
});

describe("connector de-duplication", () => {
  it("keeps one entry per wallet name, preferring the first, named wallets first", () => {
    const unique = uniqueConnectorsByName([
      { name: "Binance Wallet", id: "announced" },
      { name: "Injected", id: "generic" },
      { name: "Binance Wallet", id: "explicit" },
      { name: "MetaMask", id: "metamask" },
    ]);
    expect(unique.map((entry) => entry.id)).toEqual(["announced", "metamask", "generic"]);
  });

  it("leaves a lone generic connector last but present", () => {
    const unique = uniqueConnectorsByName([{ name: "Injected", id: "generic" }]);
    expect(unique.map((entry) => entry.id)).toEqual(["generic"]);
  });

  it("ignores case and surrounding spaces", () => {
    const unique = uniqueConnectorsByName([{ name: "Binance Wallet" }, { name: " binance wallet " }]);
    expect(unique).toHaveLength(1);
  });

  it("passes an empty list through", () => {
    expect(uniqueConnectorsByName([])).toEqual([]);
  });
});
