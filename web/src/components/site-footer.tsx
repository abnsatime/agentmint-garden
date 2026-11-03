import { contractExplorerUrl } from "@/lib/contracts";
import { WalletDiagnostics } from "@/components/wallet-diagnostics";

export function SiteFooter({ diagnostics = false }: { diagnostics?: boolean }) {
  return (
    <footer className="site-footer">
      <span>AgentMint Garden · an educational testnet project, not audited</span>
      <a href={contractExplorerUrl} rel="noreferrer" target="_blank">
        Contract on BscScan ↗
      </a>
      {diagnostics && <WalletDiagnostics />}
    </footer>
  );
}
