import { createPublicClient, http, toEventSelector, type Hex } from "viem";
import { bscTestnet } from "viem/chains";
import { bscTestnetRpcUrl } from "./wagmi";

/**
 * A dedicated client for `eth_getLogs`, because the read endpoint used for state calls
 * refuses wide block ranges. publicnode allows a 45k span, which is what the windowing
 * helpers assume.
 */
export const logClient = createPublicClient({
  chain: bscTestnet,
  transport: http("https://bsc-testnet-rpc.publicnode.com"),
});

export const stateClient = createPublicClient({
  chain: bscTestnet,
  transport: http(bscTestnetRpcUrl),
});

export const LOG_WINDOW = 45_000n;

export const GARDEN_MINTED_TOPIC = toEventSelector("GardenMinted(address,uint256,bool,uint256)");
export const TRANSFER_TOPIC = toEventSelector("Transfer(address,address,uint256)");

export type RawLogShape = {
  topics: readonly string[];
  data: string;
  blockNumber: string | number | bigint | null;
  transactionHash: string | null;
  logIndex?: string | number | bigint | null;
};

/** Pages through a block range with a topic filter and returns the raw logs. */
export async function collectLogs(
  address: `0x${string}`,
  topics: readonly (Hex | readonly Hex[] | null)[],
  fromBlock: bigint,
  toBlock: bigint,
): Promise<RawLogShape[]> {
  const collected: RawLogShape[] = [];
  let cursor = fromBlock;

  while (cursor <= toBlock) {
    const end = cursor + LOG_WINDOW - 1n > toBlock ? toBlock : cursor + LOG_WINDOW - 1n;
    const chunk = await logClient.request({
      method: "eth_getLogs",
      params: [
        {
          address,
          topics: [...topics] as (Hex | Hex[] | null)[],
          fromBlock: `0x${cursor.toString(16)}`,
          toBlock: `0x${end.toString(16)}`,
        },
      ],
    });
    collected.push(...(chunk as RawLogShape[]));
    cursor = end + 1n;
  }

  return collected;
}

/** Block timestamps, fetched once per distinct block. */
export async function blockTimestamps(blockNumbers: number[]): Promise<Map<number, number>> {
  const unique = [...new Set(blockNumbers)];
  const timestamps = new Map<number, number>();
  for (const number of unique) {
    const block = await logClient.getBlock({ blockNumber: BigInt(number) });
    timestamps.set(number, Number(block.timestamp));
  }
  return timestamps;
}
