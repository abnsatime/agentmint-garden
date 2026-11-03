import Link from "next/link";
import { WalletButton } from "@/components/wallet-button";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <span className="brand-mark">A</span>
        <span className="brand-text">
          AgentMint Garden <span className="brand-muted">/ GARDEN</span>
        </span>
      </Link>
      <div className="header-right">
        <span className="network-chip">
          <span className="dot" />
          BSC Testnet · 97
        </span>
        <WalletButton />
      </div>
    </header>
  );
}
