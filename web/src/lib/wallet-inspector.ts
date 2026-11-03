/**
 * Snapshot of what the page can actually see. Rendered on the mint page so a visitor can
 * report their setup without opening DevTools.
 */

export type HostSlot = {
  present: boolean;
  hasRequest: boolean;
};

export type HostSnapshot = {
  ethereum: HostSlot & {
    isMetaMask: boolean;
    isBinance: boolean;
    providerCount: number;
    /** Nested providers that do implement EIP-1193, which is what a facade relies on. */
    usableProviders: number;
  };
  binanceChain: HostSlot;
  binanceW3W: HostSlot;
  trustwallet: HostSlot;
  okxwallet: HostSlot;
  coinbase: HostSlot;
};

type Inspectable = {
  request?: unknown;
  isMetaMask?: boolean;
  isBinance?: boolean;
  isBinanceWallet?: boolean;
  providers?: Inspectable[];
};

export type InspectHost = {
  ethereum?: Inspectable;
  BinanceChain?: Inspectable;
  binancew3w?: Inspectable;
  trustwallet?: Inspectable;
  okxwallet?: Inspectable;
  coinbaseWalletExtension?: Inspectable;
};

function slot(value: Inspectable | undefined | null): HostSlot {
  return {
    present: Boolean(value),
    hasRequest: typeof value?.request === "function",
  };
}

export function snapshotHost(host: InspectHost | null | undefined): HostSnapshot {
  const ethereum = host?.ethereum;
  const nested = Array.isArray(ethereum?.providers) ? ethereum.providers : [];
  return {
    ethereum: {
      ...slot(ethereum),
      isMetaMask: Boolean(ethereum?.isMetaMask),
      isBinance: Boolean(ethereum?.isBinance || ethereum?.isBinanceWallet),
      providerCount: nested.length,
      usableProviders: nested.filter((entry) => typeof entry?.request === "function").length,
    },
    binanceChain: slot(host?.BinanceChain),
    binanceW3W: slot(host?.binancew3w),
    trustwallet: slot(host?.trustwallet),
    okxwallet: slot(host?.okxwallet),
    coinbase: slot(host?.coinbaseWalletExtension),
  };
}

/** One-line verdict so the common cases need no interpretation. */
export function snapshotVerdict(snapshot: HostSnapshot): string {
  const slots = [
    snapshot.ethereum,
    snapshot.binanceChain,
    snapshot.binanceW3W,
    snapshot.trustwallet,
    snapshot.okxwallet,
    snapshot.coinbase,
  ];
  if (!slots.some((entry) => entry.present)) {
    return "No wallet object is visible to this page. The extension is missing, disabled for this site, or installed in a different browser.";
  }
  // A multi-wallet facade exposes no request method of its own; its nested providers do.
  const usable =
    snapshot.ethereum.hasRequest ||
    snapshot.ethereum.usableProviders > 0 ||
    slots.some((entry) => entry.present && entry.hasRequest);
  if (!usable) {
    return "A wallet object exists but none of them implements EIP-1193 request(). That wallet cannot talk to this page.";
  }
  return "At least one usable wallet is visible.";
}
