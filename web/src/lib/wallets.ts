import { injected } from "wagmi/connectors";
import type { CreateConnectorFn } from "wagmi";

/**
 * Wallet detection, kept as a pure function of the injected host object so it can be tested
 * without a browser.
 *
 * Two traps this guards against:
 *
 * 1. A browser can host several injected wallets, but only one owns `window.ethereum`. Binding
 *    the generic connector to it silently picks that wallet whatever the visitor intended.
 * 2. Not every injected object is an EIP-1193 provider. The legacy Binance Chain wallet
 *    exposes `window.BinanceChain` with `send` / `sendAsync` only, so registering it makes the
 *    first call die with "provider.request is not a function". Anything without a callable
 *    `request` is therefore ignored.
 */

type Eip1193Request = (args: { method: string; params?: unknown[] }) => Promise<unknown>;

type MaybeProvider = {
  request?: Eip1193Request;
  isMetaMask?: boolean;
  isBinance?: boolean;
  isBinanceWallet?: boolean;
  isTrust?: boolean;
  isOkxWallet?: boolean;
  isCoinbaseWallet?: boolean;
  providers?: MaybeProvider[];
};

export type WalletHost = {
  ethereum?: MaybeProvider;
  BinanceChain?: MaybeProvider;
  binancew3w?: MaybeProvider;
  trustwallet?: MaybeProvider;
  okxwallet?: MaybeProvider;
  coinbaseWalletExtension?: MaybeProvider;
};

type Provider = { request: Eip1193Request };

export type WalletCandidate = {
  id: string;
  name: string;
  provider: Provider;
};

function isEip1193(value: MaybeProvider | undefined | null): value is MaybeProvider & Provider {
  return Boolean(value) && typeof value?.request === "function";
}

function flagsOf(candidate: MaybeProvider) {
  return {
    binance: Boolean(candidate.isBinance || candidate.isBinanceWallet),
    metaMask: Boolean(candidate.isMetaMask && !(candidate.isBinance || candidate.isBinanceWallet)),
    trust: Boolean(candidate.isTrust),
    okx: Boolean(candidate.isOkxWallet),
    coinbase: Boolean(candidate.isCoinbaseWallet),
  };
}

/**
 * Ordered so the wallets a BSC visitor is most likely to use come first. Duplicates are
 * removed by provider identity, because several of these slots can point at the same object.
 */
export function detectWallets(host: WalletHost | null | undefined): WalletCandidate[] {
  if (!host) return [];

  const found: WalletCandidate[] = [];
  const seen = new Set<Provider>();

  const add = (id: string, name: string, candidate: MaybeProvider | undefined) => {
    if (!isEip1193(candidate)) return;
    const provider = candidate as Provider;
    if (seen.has(provider)) return;
    seen.add(provider);
    found.push({ id: `${id}-${found.length}`, name, provider });
  };

  // A multi-wallet facade ("providers" array) is the most reliable source of real choices.
  for (const nested of host.ethereum?.providers ?? []) {
    const flags = flagsOf(nested);
    if (flags.binance) add("binance", "Binance Wallet", nested);
    else if (flags.metaMask) add("metamask", "MetaMask", nested);
    else if (flags.trust) add("trust", "Trust Wallet", nested);
    else if (flags.okx) add("okx", "OKX Wallet", nested);
    else if (flags.coinbase) add("coinbase", "Coinbase Wallet", nested);
    else add("injected", "Browser wallet", nested);
  }

  const ethereumFlags = host.ethereum ? flagsOf(host.ethereum) : null;

  // Modern Binance Web3 Wallet injects its own object.
  add("binancew3w", "Binance Wallet", host.binancew3w);

  if (host.ethereum && ethereumFlags?.binance) add("binance", "Binance Wallet", host.ethereum);
  if (host.ethereum && ethereumFlags?.metaMask) add("metamask", "MetaMask", host.ethereum);
  if (host.ethereum && ethereumFlags?.trust) add("trust", "Trust Wallet", host.ethereum);
  if (host.ethereum && ethereumFlags?.okx) add("okx", "OKX Wallet", host.ethereum);
  if (host.ethereum && ethereumFlags?.coinbase) add("coinbase", "Coinbase Wallet", host.ethereum);

  // Only reachable for wallets that actually implement EIP-1193; the legacy BNB Beacon Chain
  // object exposes `send` instead of `request` and is skipped here on purpose.
  add("binancechain", "Binance Wallet", host.BinanceChain);
  add("trust", "Trust Wallet", host.trustwallet);
  add("okx", "OKX Wallet", host.okxwallet);
  add("coinbase", "Coinbase Wallet", host.coinbaseWalletExtension);

  // Injection order is whatever the extensions happened to race into, so the list is sorted
  // by relevance: a BSC visitor almost always wants Binance Wallet first.
  return found.sort((left, right) => rank(left.name) - rank(right.name));
}

const WALLET_RANK: Record<string, number> = {
  "Binance Wallet": 0,
  MetaMask: 1,
  "Trust Wallet": 2,
  "OKX Wallet": 3,
  "Coinbase Wallet": 4,
  "Browser wallet": 5,
};

function rank(name: string) {
  return WALLET_RANK[name] ?? 6;
}

function injectedHost(): WalletHost | null {
  if (typeof window === "undefined") return null;
  return window as unknown as WalletHost;
}

export function walletConnectors(): CreateConnectorFn[] {
  const detected = detectWallets(injectedHost());

  // wagmi types `provider` as viem's fully featured Provider, while an injected wallet is only
  // guaranteed to implement `request`. They are compatible at runtime, so the cast stays here.
  const connectors: CreateConnectorFn[] = detected.map((wallet) =>
    injected({
      target: {
        id: wallet.id,
        name: wallet.name,
        provider: wallet.provider as unknown as never,
      },
    }),
  );

  // Fallback for EIP-6963 announcements and anything else injected; also the only connector
  // when nothing at all is detected.
  connectors.push(injected());

  return connectors;
}

/**
 * Whether the connect action should show the wallet list first.
 *
 * A single named wallet can connect immediately; a lone "Injected" connector cannot, because
 * that name says nothing about which extension will answer.
 */
export function shouldAskForWallet(connectors: ReadonlyArray<{ name: string }>): boolean {
  if (connectors.length !== 1) return true;
  return connectors[0].name.toLowerCase() === "injected";
}

/** Turns wallet-provider failures into something a visitor can act on. */
export function describeConnectError(error: unknown): string {
  const message =
    (error as { shortMessage?: string })?.shortMessage ??
    (error as Error)?.message ??
    "";

  if (/request is not a function|not a function|EIP-1193/i.test(message)) {
    return "That wallet does not expose the provider API this page needs. Pick another wallet from the list.";
  }
  if (/provider not found|no provider|provider is not/i.test(message)) {
    return "No wallet extension was detected. Install Binance Wallet or MetaMask, then reload this page.";
  }
  if (/rejected|denied|4001/i.test(message)) return "You closed the wallet request.";
  return message.split("\n")[0] || "The wallet connection failed.";
}
