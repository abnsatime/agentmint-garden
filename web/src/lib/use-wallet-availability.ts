"use client";

import { useEffect, useRef, useState } from "react";
import { detectWallets, type WalletHost } from "./wallets";

/**
 * Whether any wallet is visible to the page at all.
 *
 * Detection at module load is too early for some extensions, so this re-checks shortly after
 * mount and again a second later, and treats an EIP-6963 announcement as proof of a wallet.
 * `null` means "still checking", which lets the UI avoid claiming anything too early.
 */
export function useWalletAvailability(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  const announced = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const check = () => detectWallets(window as unknown as WalletHost).length > 0 || announced.current;

    const onAnnounce = () => {
      announced.current = true;
      setAvailable(true);
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    const early = window.setTimeout(() => setAvailable(check()), 350);
    const late = window.setTimeout(() => setAvailable(check()), 1500);

    return () => {
      window.clearTimeout(early);
      window.clearTimeout(late);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
    };
  }, []);

  return available;
}
