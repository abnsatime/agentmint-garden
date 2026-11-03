"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { bscTestnet } from "wagmi/chains";

/** Parameters used when a wallet has never seen BSC Testnet (error 4902). */
export const bscTestnetParams = {
  chainId: "0x61",
  chainName: "BNB Smart Chain Testnet",
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  rpcUrls: ["https://bsc-testnet-dataseed.bnbchain.org"],
  blockExplorerUrls: ["https://testnet.bscscan.com"],
};

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function readable(error: unknown) {
  const message =
    (error as { shortMessage?: string })?.shortMessage ??
    (error as Error)?.message ??
    "The wallet refused the network switch.";
  if (/rejected|denied|4001/i.test(message)) {
    return "You rejected the network switch in your wallet.";
  }
  if (/unrecognized chain|not added|4902/i.test(message)) {
    return "Your wallet does not know BSC Testnet yet. Approve adding it when prompted.";
  }
  return message.split("\n")[0];
}

/**
 * Ground truth about the wallet's network.
 *
 * `useAccount().chainId` depends on the connector having received a `chainChanged` event.
 * A wallet that was switched before this app bound, or that only announces changes to its
 * own injected object, leaves that value stale — the UI then claims a switch is needed
 * while the wallet is already on testnet. So we ask the provider directly, re-ask on an
 * interval, and treat that answer as authoritative.
 */
export function useWalletChain() {
  const { chainId: accountChainId, connector, isConnected } = useAccount();
  const configChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const [probed, setProbed] = useState<{ key: string; chainId: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectorKey = connector
    ? `${(connector as { uid?: string }).uid ?? connector.id}`
    : null;

  useEffect(() => {
    if (!connector || !connectorKey || !isConnected) return;
    let cancelled = false;

    const probe = async () => {
      try {
        const provider = (await connector.getProvider()) as Eip1193Provider;
        const hex = await provider.request({ method: "eth_chainId" });
        const parsed = Number(hex);
        if (!cancelled && Number.isFinite(parsed)) {
          setProbed({ key: connectorKey, chainId: parsed });
        }
      } catch {
        /* a wallet that refuses eth_chainId leaves the wagmi value in play */
      }
    };

    void probe();
    const timer = setInterval(probe, 4_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connector, connectorKey, isConnected]);

  // A probe from a previous connector must not decide the state of the current one.
  const probedChainId =
    probed && connectorKey && probed.key === connectorKey ? probed.chainId : null;

  const chainId = probedChainId ?? accountChainId ?? configChainId;
  const isOnTestnet = chainId === bscTestnet.id;

  const switchToTestnet = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await switchChainAsync({ chainId: bscTestnet.id });
    } catch (switchError) {
      const code = (switchError as { code?: number })?.code;
      const message = String((switchError as Error)?.message ?? "");
      const unknownChain = code === 4902 || /4902|unrecognized chain|not added/i.test(message);

      if (!unknownChain) {
        setError(readable(switchError));
        setBusy(false);
        return;
      }
      try {
        const provider = (await connector?.getProvider()) as Eip1193Provider | undefined;
        await provider?.request({
          method: "wallet_addEthereumChain",
          params: [bscTestnetParams],
        });
        await switchChainAsync({ chainId: bscTestnet.id });
      } catch (addError) {
        setError(readable(addError));
      }
    } finally {
      setBusy(false);
    }
  }, [connector, switchChainAsync]);

  return { chainId, isOnTestnet, switchToTestnet, busy, error };
}
