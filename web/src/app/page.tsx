import { GardenStats } from "@/components/garden-stats";
import { MintPanel } from "@/components/mint-panel";
import { PolicySection } from "@/components/policy-section";
import { WalletButton } from "@/components/wallet-button";
import { WalletDiagnostics } from "@/components/wallet-diagnostics";
import { contractExplorerUrl } from "@/lib/contracts";

export default function Page() {
  return (
    <div className="shell">
      <header className="site-header">
        <a className="brand" href="#top">
          <span className="brand-mark">A</span>
          <span className="brand-text">
            AgentMint Garden <span className="brand-muted">/ GARDEN</span>
          </span>
        </a>
        <div className="header-right">
          <span className="network-chip">
            <span className="dot" />
            BSC Testnet · 97
          </span>
          <WalletButton />
        </div>
      </header>

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
              <a className="button button-primary" href="#mint">
                Mint an NFT
              </a>
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
        <MintPanel />
        <PolicySection />
      </main>

      <footer className="site-footer">
        <span>AgentMint Garden · an educational testnet project, not audited</span>
        <a href={contractExplorerUrl} rel="noreferrer" target="_blank">
          Contract on BscScan ↗
        </a>
        <WalletDiagnostics />
      </footer>
    </div>
  );
}
