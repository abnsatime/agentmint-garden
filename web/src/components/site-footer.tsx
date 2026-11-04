import { WalletDiagnostics } from "@/components/wallet-diagnostics";
import { contractExplorerUrl } from "@/lib/contracts";
import { showFooterDiagnostics } from "@/lib/flags";

export function SiteFooter({ diagnostics = false }: { diagnostics?: boolean }) {
  return (
    <footer className="site-footer">
      <span>AgentMint Garden · an educational testnet project, not audited</span>
      <a href={contractExplorerUrl} rel="noreferrer" target="_blank">
        Contract on BscScan ↗
      </a>
      {showFooterDiagnostics(diagnostics) && <WalletDiagnostics />}
    </footer>
  );
}
