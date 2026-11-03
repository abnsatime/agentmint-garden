import { createConfig, http } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { walletConnectors } from "./wallets";

export const bscTestnetRpcUrl =
  process.env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-dataseed.bnbchain.org";

export const wagmiConfig = createConfig({
  chains: [bscTestnet],
  connectors: walletConnectors(),
  ssr: true,
  transports: {
    [bscTestnet.id]: http(bscTestnetRpcUrl),
  },
});
