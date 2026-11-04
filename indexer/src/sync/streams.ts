import type { Address, Hex } from "viem";
import type { Config } from "../env.js";
import { GARDEN_MINTED_TOPIC, MARKET_TOPIC_LIST, TRANSFER_TOPIC, type RawLog } from "./events.js";
import { collectGardenRows, collectMarketRows, type PendingEvents } from "./rows.js";
import type { TimestampLookup } from "./timestamps.js";

/**
 * A stream is one contract and one cursor. The garden stream needs two topics because mints and
 * transfers are separate events; they are fetched together and dispatched by topic on decode.
 */
export interface StreamSpec {
  name: string;
  address: Address;
  deployBlock: bigint;
  topics: Hex[];
  collect: (logs: readonly RawLog[], at: TimestampLookup) => PendingEvents;
}

export function streamsFor(config: Config): StreamSpec[] {
  return [
    {
      name: "garden",
      address: config.garden.address,
      deployBlock: config.garden.deployBlock,
      topics: [GARDEN_MINTED_TOPIC, TRANSFER_TOPIC],
      collect: collectGardenRows,
    },
    {
      name: "market",
      address: config.market.address,
      deployBlock: config.market.deployBlock,
      topics: MARKET_TOPIC_LIST,
      collect: collectMarketRows,
    },
  ];
}
