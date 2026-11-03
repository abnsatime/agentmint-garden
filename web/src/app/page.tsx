import Link from "next/link";
import { GardenStats } from "@/components/garden-stats";
import { PolicySection } from "@/components/policy-section";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { contractExplorerUrl } from "@/lib/contracts";

export default function HomePage() {
  return (
    <div className="shell">
      <SiteHeader />

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Onchain garden · chain 97</p>
            <h1 className="hero-title">
              Plant the
              <br />
              first garden.
            </h1>
            <p className="hero-lede">
              Two thousand deterministic gardens on BNB Smart Chain Testnet. The first thousand
              are free, two per wallet, and every leaf is drawn by the contract itself.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" href="/mint">
                Mint an NFT →
              </Link>
              <a
                className="button button-ghost"
                href={contractExplorerUrl}
                rel="noreferrer"
                target="_blank"
              >
                Read the contract ↗
              </a>
            </div>
            <p className="hero-note">Testnet only · tBNB has no value</p>
          </div>

          <div className="hero-art" aria-hidden="true">
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
            <span className="hero-mark">
              <svg viewBox="0 0 640 640" role="presentation">
                <circle cx="320" cy="300" r="190" fill="none" stroke="#A8FF78" strokeWidth="18" />
                <path d="M220 350 Q320 150 420 350 Q320 470 220 350Z" fill="#A8FF78" />
              </svg>
            </span>
          </div>
        </section>

        <GardenStats />

        <section className="route-callout">
          <p>
            <strong>Ready to plant?</strong>
            The mint page reads the live price, checks your wallet allowance and shows the
            artwork of the token you are about to mint.
          </p>
          <Link className="button button-primary" href="/mint">
            Go to mint →
          </Link>
        </section>

        <PolicySection />
      </main>

      <SiteFooter />
    </div>
  );
}
