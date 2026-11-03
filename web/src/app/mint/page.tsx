import type { Metadata } from "next";
import Link from "next/link";
import { GardenStats } from "@/components/garden-stats";
import { MintPanel } from "@/components/mint-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WalletInspector } from "@/components/wallet-inspector";

export const metadata: Metadata = {
  title: "Mint — AgentMint Garden",
  description: "Mint one or two onchain gardens on BNB Smart Chain Testnet.",
};

export default function MintPage() {
  return (
    <div className="shell">
      <SiteHeader />

      <main>
        <nav className="crumbs">
          <Link href="/">← Back to the garden</Link>
        </nav>

        <GardenStats />
        <MintPanel />
        <WalletInspector />
      </main>

      <SiteFooter diagnostics />
    </div>
  );
}
