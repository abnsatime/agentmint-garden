import type { Metadata } from "next";
import Link from "next/link";
import { MarketGrid } from "@/components/market-grid";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { bnbUsdRate, marketExplorerUrl } from "@/lib/market-contracts";

export const metadata: Metadata = {
  title: "Market — AgentMint Garden",
  description: "Fixed-price listings of AgentMint Garden tokens on BNB Smart Chain Testnet.",
};

export default function MarketPage() {
  return (
    <div className="shell">
      <SiteHeader />

      <main>
        <nav className="crumbs">
          <Link href="/">← Back to the garden</Link>
        </nav>

        <header className="gallery-head">
          <p className="eyebrow">Market</p>
          <h1 className="gallery-heading">Gardens for sale</h1>
          <p className="gallery-lede">
            Listings are approvals, not escrow: a listed token stays in the seller&apos;s wallet
            until someone pays the exact ask, and the whole price goes to the seller in the same
            transaction. Dollar figures are indicative, using a rate of {bnbUsdRate} USD per BNB.
          </p>
          <p className="market-links">
            <Link className="me-link" href="/me">
              Sell one of yours →
            </Link>
            <a className="me-link" href={marketExplorerUrl} rel="noreferrer" target="_blank">
              Market contract ↗
            </a>
          </p>
        </header>

        <MarketGrid />
      </main>

      <SiteFooter />
    </div>
  );
}
