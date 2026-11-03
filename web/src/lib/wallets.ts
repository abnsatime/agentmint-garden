import { injected } from "wagmi/connectors";
import type { CreateConnectorFn } from "wagmi";

/**
 * Browsers happily host several injected wallets at once, but only one of them owns
 * `window.ethereum`. wagmi's generic `injected()` connector binds to that one, so a visitor
 * whose Binance Wallet is not announced over EIP-6963 ends up talking to MetaMask no matter
 * what they pick in their extension.
 *
 * So the known providers are registered explicitly, by name, and the generic connector stays
 * as a fallback for EIP-6963 announcements and anything else injected.
 */

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  isBinance?: boolean;
  isBinanceWallet?: boolean;
};

type WalletWindow = {
  ethereum?: Eip1193Provider;
  BinanceChain?: Eip1193Provider;
  binancew3w?: Eip1193Provider;
  trustwallet?: Eip1193Provider;
  okxwallet?: Eip1193Provider;
  coinbaseWalletExtension?: Eip1193Provider;
};

function injectedWindow(): WalletWindow | null {
  if (typeof window === "undefined") return null;
  return window as unknown as WalletWindow;
}

/** Ordered so the wallets a BSC visitor is most likely to use come first. */
export function walletConnectors(): CreateConnectorFn[] {
  const host = injectedWindow();
  if (!host) return [injected()];

  const binance =
    host.BinanceChain ??
    host.binancew3w ??
    (host.ethereum?.isBinance || host.ethereum?.isBinanceWallet ? host.ethereum : undefined);

  const metaMask = host.ethereum?.isMetaMask ? host.ethereum : undefined;
  const trust = host.trustwallet;
  const okx = host.okxwallet;
  const coinbase = host.coinbaseWalletExtension;

  const explicit: Array<{ id: string; name: string; provider: Eip1193Provider }> = [];
  if (binance) explicit.push({ id: "binanceWallet", name: "Binance Wallet", provider: binance });
  if (metaMask && metaMask !== binance) {
    explicit.push({ id: "metaMaskWallet", name: "MetaMask", provider: metaMask });
  }
  if (trust) explicit.push({ id: "trustWallet", name: "Trust Wallet", provider: trust });
  if (okx) explicit.push({ id: "okxWallet", name: "OKX Wallet", provider: okx });
  if (coinbase) explicit.push({ id: "coinbaseWallet", name: "Coinbase Wallet", provider: coinbase });

  // wagmi types `provider` as viem's fully featured Provider, while an injected wallet is
  // only guaranteed to implement `request`. They are structurally compatible at runtime, so
  // the cast is confined to this registration boundary instead of leaking into components.
  const connectors: CreateConnectorFn[] = explicit.map((wallet) =>
    injected({
      target: {
        id: wallet.id,
        name: wallet.name,
        provider: wallet.provider as unknown as never,
      },
    }),
  );

  // Generic connector: covers EIP-6963 announcements and any other injected wallet.
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
