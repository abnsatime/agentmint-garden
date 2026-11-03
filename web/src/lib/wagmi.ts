import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { bscTestnet } from "wagmi/chains";

export const bscTestnetRpcUrl =
  process.env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL ?? "https://bsc-testnet-dataseed.bnbchain.org";

export const wagmiConfig = createConfig({
  chains: [bscTestnet],
  connectors: [injected()],
  ssr: true,
  transports: {
    [bscTestnet.id]: http(bscTestnetRpcUrl),
  },
});
