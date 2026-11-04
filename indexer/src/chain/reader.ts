import { createPublicClient, http, type Address, type Hex, type PublicClient } from "viem";
import { bscTestnet } from "viem/chains";
import type { RawLog } from "../sync/events.js";

/**
 * The chain surface the sync loop needs. Narrow on purpose: the runner can then be driven by a
 * fake in tests without a node or a network.
 */
export interface ChainReader {
  head(): Promise<bigint>;
  logs(params: {
    address: Address;
    topics: Hex[];
    fromBlock: bigint;
    toBlock: bigint;
  }): Promise<RawLog[]>;
  timestamp(blockNumber: bigint): Promise<bigint>;
}

export interface ViemReader extends ChainReader {
  client: PublicClient;
}

export function createChainReader(rpcUrl: string, options: { timeoutMs?: number } = {}): ViemReader {
  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(rpcUrl, { retryCount: 2, timeout: options.timeoutMs ?? 20_000 }),
  });

  return {
    client,
    head: () => client.getBlockNumber(),

    logs: async ({ address, topics, fromBlock, toBlock }) => {
      // Raw eth_getLogs: the topics are already computed, and an array in topic0 means "any of".
      const raw = await client.request({
        method: "eth_getLogs",
        params: [
          {
            address,
            topics: [topics],
            fromBlock: `0x${fromBlock.toString(16)}`,
            toBlock: `0x${toBlock.toString(16)}`,
          },
        ],
      });
      return raw as unknown as RawLog[];
    },

    timestamp: async (blockNumber) => (await client.getBlock({ blockNumber })).timestamp,
  };
}
