"use client";

import { useAccount } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { useGarden } from "@/lib/use-garden";
import { useWalletChain } from "@/lib/use-wallet-chain";
import { maxQuantity, mintBlocker } from "@/lib/mint";

/**
 * A one-line summary of every input that can disable the mint button. Deliberately always
 * visible: on a testnet learning project it is more useful to see why a button is inert
 * than to hide the machinery.
 */
export function WalletDiagnostics() {
  const { isConnected } = useAccount();
  const { chainId, isOnTestnet } = useWalletChain();
  const { supply, price, policy, paused, mintedBy, balance } = useGarden();

  const blocker = mintBlocker({
    isConnected,
    chainId,
    expectedChainId: bscTestnet.id,
    paused,
    supply,
    mintedBy,
    policy,
    price,
    quantity: 1,
    balance,
  });

  const allowance = maxQuantity(supply, mintedBy, policy);

  return (
    <p className="diagnostics">
      <span>state</span>
      {` connected ${isConnected}`}
      {` · chain ${chainId ?? "unknown"}`}
      {` · testnet ${isOnTestnet}`}
      {` · supply ${supply.toString()}`}
      {` · minted ${mintedBy.toString()} (allowance ${allowance.toString()})`}
      {` · paused ${paused}`}
      {` · price ${price.toString()}`}
      {` · blocker ${blocker}`}
    </p>
  );
}
