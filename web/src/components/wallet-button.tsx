"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortAddress } from "@/lib/format";
import { useWalletChain } from "@/lib/use-wallet-chain";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { chainId, isOnTestnet, switchToTestnet, busy, error: switchError } = useWalletChain();
  const [picking, setPicking] = useState(false);

  if (isConnected) {
    if (!isOnTestnet) {
      return (
        <div className="wallet-connect">
          <button
            className="button button-warning"
            disabled={busy}
            onClick={() => void switchToTestnet()}
            title={`Wallet reports chain id ${chainId ?? "unknown"}`}
            type="button"
          >
            {busy
              ? "Switching…"
              : chainId === undefined
                ? "Checking wallet network…"
                : `Switch to BSC Testnet (on ${chainId})`}
          </button>
          {switchError && <p className="wallet-error">{switchError}</p>}
        </div>
      );
    }
    return (
      <button
        className="wallet-pill"
        onClick={() => disconnect()}
        title="Disconnect wallet"
        type="button"
      >
        <span className="dot" />
        {address ? shortAddress(address) : "Connected"}
        <span className="wallet-pill-action">Disconnect</span>
      </button>
    );
  }

  const available = connectors;
  const primary = available[0];

  return (
    <div className="wallet-connect">
      <button
        className="button button-primary"
        disabled={!primary || isPending}
        onClick={() => {
          if (available.length <= 1) {
            if (primary) connect({ connector: primary });
            return;
          }
          setPicking((value) => !value);
        }}
        type="button"
      >
        {isPending ? "Opening wallet…" : primary ? "Connect wallet" : "No wallet detected"}
      </button>

      {picking && available.length > 1 && (
        <ul className="connector-list">
          {available.map((connector, index) => (
            <li key={`${connector.id}-${index}`}>
              <button
                onClick={() => {
                  setPicking(false);
                  connect({ connector });
                }}
                type="button"
              >
                {connector.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="wallet-error">{error.message.split("\n")[0]}</p>}
    </div>
  );
}
