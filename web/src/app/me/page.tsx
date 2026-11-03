import type { Metadata } from "next";
import Link from "next/link";
import { MyGardenPanel } from "@/components/my-garden-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "My garden — AgentMint Garden",
  description:
    "The gardens a wallet holds, how each one arrived, and its onchain artwork and traits.",
};

export default function MePage() {
  return (
    <div className="shell">
      <SiteHeader />

      <main>
        <nav className="crumbs">
          <Link href="/">← Back to the garden</Link>
        </nav>

        <header className="gallery-head">
          <p className="eyebrow">My garden</p>
          <h1 className="gallery-heading">Your plots, from mint to transfer</h1>
          <p className="gallery-lede">
            Ownership is reconstructed from <code>Transfer</code> events because the contract is
            not enumerable, mint prices come from <code>GardenMinted</code>, and each token&apos;s
            artwork and traits are decoded from its onchain <code>tokenURI</code>.
          </p>
        </header>

        <MyGardenPanel />
      </main>

      <SiteFooter />
    </div>
  );
}
