"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddress } from "@/lib/format";
import { shouldAskForWallet } from "@/lib/wallets";
import { useWalletChain } from "@/lib/use-wallet-chain";

export function WalletButton() {
  const { address, isConnected, connector } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { chainId, isOnTestnet, switchToTestnet, busy, error: switchError } = useWalletChain();
  const [picking, setPicking] = useState(false);

  const walletName = connector?.name ?? "Wallet";
  const picker = picking ? (
    <ul className="connector-list">
      {connectors.map((item, index) => (
        <li key={`${item.id}-${index}`}>
          <button
            onClick={() => {
              setPicking(false);
              connect({ connector: item });
            }}
            type="button"
          >
            {item.name}
          </button>
        </li>
      ))}
      {isConnected && (
        <li>
          <button
            className="connector-disconnect"
            onClick={() => {
              setPicking(false);
              disconnect();
            }}
            type="button"
          >
            Disconnect
          </button>
        </li>
      )}
    </ul>
  ) : null;

  if (isConnected) {
    if (!isOnTestnet) {
      return (
        <div className="wallet-connect">
          <div className="wallet-actions">
            <button
              className="button button-warning"
              disabled={busy}
              onClick={() => void switchToTestnet()}
              type="button"
            >
              {busy
                ? "Switching…"
                : chainId === undefined
                  ? "Checking network…"
                  : `Switch to BSC Testnet (on ${chainId})`}
            </button>
            <button
              className="button button-ghost"
              onClick={() => {
                disconnect();
                setPicking(true);
              }}
              type="button"
            >
              Use another wallet
            </button>
          </div>
          <p className="wallet-hint">Connected with {walletName}</p>
          {switchError && <p className="wallet-error">{switchError}</p>}
          {picker}
        </div>
      );
    }

    return (
      <div className="wallet-connect">
        <button
          className="wallet-pill"
          onClick={() => setPicking((value) => !value)}
          title="Switch or disconnect wallet"
          type="button"
        >
          <span className="dot" />
          {address ? shortAddress(address) : "Connected"}
          <span className="wallet-pill-action">{walletName}</span>
        </button>
        {picker}
      </div>
    );
  }

  const hasWallet = connectors.length > 0;

  return (
    <div className="wallet-connect">
      <button
        className="button button-primary"
        disabled={!hasWallet || isPending}
        onClick={() => {
          if (!hasWallet) return;
          if (!shouldAskForWallet(connectors)) {
            connect({ connector: connectors[0] });
            return;
          }
          setPicking((value) => !value);
        }}
        type="button"
      >
        {isPending ? "Opening wallet…" : hasWallet ? "Connect wallet" : "No wallet detected"}
      </button>

      {picker}
      {error && <p className="wallet-error">{error.message.split("\n")[0]}</p>}
    </div>
  );
}
