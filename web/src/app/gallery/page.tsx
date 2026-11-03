import type { Metadata } from "next";
import Link from "next/link";
import { GalleryGrid } from "@/components/gallery-grid";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Gallery — AgentMint Garden",
  description: "Every garden minted so far, read straight from the contract on BNB Smart Chain Testnet.",
};

export default function GalleryPage() {
  return (
    <div className="shell">
      <SiteHeader />

      <main>
        <nav className="crumbs">
          <Link href="/">← Back to the garden</Link>
        </nav>

        <header className="gallery-head">
          <p className="eyebrow">Gallery</p>
          <h1 className="gallery-heading">Every plot planted so far</h1>
          <p className="gallery-lede">
            Artwork and metadata are read from each token&apos;s on-chain URI, and the mint
            provenance comes from the contract&apos;s <code>GardenMinted</code> events. Nothing
            here is cached or served from a database.
          </p>
        </header>

        <GalleryGrid />
      </main>

      <SiteFooter />
    </div>
  );
}
