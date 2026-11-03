import { describe, expect, it } from "vitest";
import { snapshotHost, snapshotVerdict } from "./wallet-inspector";

describe("host snapshot", () => {
  it("reports nothing when no host is reachable", () => {
    const snapshot = snapshotHost(undefined);
    expect(snapshot.ethereum.present).toBe(false);
    expect(snapshotVerdict(snapshot)).toContain("No wallet object is visible");
  });

  it("separates presence from usability for the legacy Binance object", () => {
    const snapshot = snapshotHost({ BinanceChain: { send: () => undefined } as never });
    expect(snapshot.binanceChain).toEqual({ present: true, hasRequest: false });
    expect(snapshotVerdict(snapshot)).toContain("none of them implements EIP-1193");
  });

  it("reads MetaMask flags", () => {
    const snapshot = snapshotHost({ ethereum: { request: async () => null, isMetaMask: true } });
    expect(snapshot.ethereum).toEqual({
      present: true,
      hasRequest: true,
      isMetaMask: true,
      isBinance: false,
      providerCount: 0,
      usableProviders: 0,
    });
    expect(snapshotVerdict(snapshot)).toContain("At least one usable wallet");
  });

  it("counts a multi-wallet facade and its usable providers", () => {
    const usable = { request: async () => null };
    const snapshot = snapshotHost({ ethereum: { providers: [usable, {}] } });
    expect(snapshot.ethereum.providerCount).toBe(2);
    expect(snapshot.ethereum.usableProviders).toBe(1);
    // The facade itself cannot answer eth_chainId, but its children can.
    expect(snapshot.ethereum.hasRequest).toBe(false);
    expect(snapshotVerdict(snapshot)).toContain("At least one usable wallet");
  });

  it("says nothing works when every facade child is legacy", () => {
    const snapshot = snapshotHost({
      ethereum: {
        providers: [
          { send: () => undefined } as never,
          { sendAsync: () => undefined } as never,
        ],
      },
    });
    expect(snapshot.ethereum.usableProviders).toBe(0);
    expect(snapshotVerdict(snapshot)).toContain("none of them implements EIP-1193");
  });

  it("treats isBinanceWallet as Binance", () => {
    const snapshot = snapshotHost({ ethereum: { request: async () => null, isBinanceWallet: true } });
    expect(snapshot.ethereum.isBinance).toBe(true);
  });

  it("sees an unmarked provider as present and usable", () => {
    const snapshot = snapshotHost({ ethereum: { request: async () => null } });
    expect(snapshot.ethereum.present).toBe(true);
    expect(snapshot.ethereum.hasRequest).toBe(true);
    expect(snapshot.ethereum.isMetaMask).toBe(false);
    expect(snapshotVerdict(snapshot)).toContain("At least one usable wallet");
  });
});
