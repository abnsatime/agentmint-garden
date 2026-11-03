"use client";

import { useEffect, useRef, useState } from "react";
import { useConnect } from "wagmi";
import {
  snapshotHost,
  snapshotVerdict,
  type HostSnapshot,
  type InspectHost,
} from "@/lib/wallet-inspector";

type Announcement = { name: string; rdns: string; hasRequest: boolean };

function describeSlot(label: string, slot: { present: boolean; hasRequest: boolean }, extra?: string) {
  if (!slot.present) return `${label}: absent`;
  return `${label}: present · request ${slot.hasRequest ? "yes" : "NO"}${extra ? ` · ${extra}` : ""}`;
}

/**
 * Shows what the page can actually see, so a visitor whose wallet does not appear can report
 * a fact instead of a guess. Collapsed by default; the summary line carries the verdict.
 */
export function WalletInspector() {
  const { connectors } = useConnect();
  const [snapshot, setSnapshot] = useState<HostSnapshot | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const read = () => setSnapshot(snapshotHost(window as unknown as InspectHost));

    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { info?: { name?: string; rdns?: string }; provider?: { request?: unknown } }
        | undefined;
      const name = detail?.info?.name;
      if (!name) return;
      const key = detail?.info?.rdns ?? name;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      setAnnouncements((current) => [
        ...current,
        {
          name,
          rdns: detail?.info?.rdns ?? "-",
          hasRequest: typeof detail?.provider?.request === "function",
        },
      ]);
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Wallets sometimes inject a tick after the page scripts run.
    const timer = window.setTimeout(read, 400);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
    };
  }, []);

  if (!snapshot) return null;

  const verdict = snapshotVerdict(snapshot);
  const ethereumExtra = [
    snapshot.ethereum.isMetaMask ? "isMetaMask" : null,
    snapshot.ethereum.isBinance ? "isBinance" : null,
    snapshot.ethereum.providerCount > 0
      ? `providers[${snapshot.ethereum.providerCount}, usable ${snapshot.ethereum.usableProviders}]`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <details className="inspector">
      <summary>
        <span className="inspector-verdict">{verdict}</span>
        <span className="inspector-hint">wallet inspector</span>
      </summary>

      <div className="inspector-body">
        <p>{describeSlot("window.ethereum", snapshot.ethereum, ethereumExtra || undefined)}</p>
        <p>{describeSlot("window.BinanceChain", snapshot.binanceChain)}</p>
        <p>{describeSlot("window.binancew3w", snapshot.binanceW3W)}</p>
        <p>{describeSlot("window.trustwallet", snapshot.trustwallet)}</p>
        <p>{describeSlot("window.okxwallet", snapshot.okxwallet)}</p>
        <p>{describeSlot("window.coinbaseWalletExtension", snapshot.coinbase)}</p>
        <p>
          EIP-6963 announcements:{" "}
          {announcements.length === 0
            ? "none"
            : announcements
                .map((entry) => `${entry.name} (${entry.rdns}, request ${entry.hasRequest ? "yes" : "NO"})`)
                .join(" · ")}
        </p>
        <p>connectors offered by the app: {connectors.map((item) => item.name).join(" · ")}</p>
      </div>
    </details>
  );
}
