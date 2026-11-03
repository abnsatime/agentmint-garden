import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "AgentMint Garden — 2,000 onchain NFT gardens on BNB Smart Chain Testnet",
  description:
    "2,000 onchain gardens on BNB Smart Chain Testnet. The first 1,000 are free, two per wallet, artwork generated onchain.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
