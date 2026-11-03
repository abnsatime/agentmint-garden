import { describe, expect, it } from "vitest";
import type { MintEvent } from "./gallery";
import { zeroAddress } from "./mint";
import {
  buildActivity,
  decodeTransferEvent,
  dedupeTransfers,
  deriveHoldings,
  summarise,
  type TransferEvent,
} from "./my-garden";
import type { RawLogShape } from "./log-client";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const OWNER = "0xF040275C3e38Cb018C491BC8a5A5437D86178A67" as const;
const OTHER = "0x14970F118EF38850eB16081DC14D28754ff4576E" as const;

function word(value: number | bigint) {
  return BigInt(value).toString(16).padStart(64, "0");
}

function rawTransfer(from: string, to: string, tokenId: number, block = 100, logIndex = 0): RawLogShape {
  return {
    topics: [TRANSFER_TOPIC, `0x${from.slice(2).padStart(64, "0")}`, `0x${to.slice(2).padStart(64, "0")}`, `0x${word(tokenId)}`],
    data: "0x",
    blockNumber: `0x${block.toString(16)}`,
    transactionHash: `0x${"ab".repeat(32)}`,
    logIndex: `0x${logIndex.toString(16)}`,
  };
}

function transfer(from: string, to: string, tokenId: number, block = 100, logIndex = 0): TransferEvent {
  return {
    from: from as TransferEvent["from"],
    to: to as TransferEvent["to"],
    tokenId,
    blockNumber: block,
    logIndex,
    transactionHash: `0x${block.toString(16).padStart(8, "0")}${"cd".repeat(28)}`,
  };
}

describe("transfer decoding", () => {
  it("reads from, to and token id", () => {
    const event = decodeTransferEvent(rawTransfer(zeroAddress, OWNER, 7), TRANSFER_TOPIC);
    expect(event).toEqual({
      from: zeroAddress,
      to: OWNER,
      tokenId: 7,
      blockNumber: 100,
      logIndex: 0,
      transactionHash: `0x${"ab".repeat(32)}`,
    });
  });

  it("ignores another event and truncated logs", () => {
    const log = rawTransfer(zeroAddress, OWNER, 1);
    expect(decodeTransferEvent({ ...log, topics: [`0x${"11".repeat(32)}`, ...log.topics.slice(1)] }, TRANSFER_TOPIC)).toBeNull();
    expect(decodeTransferEvent({ ...log, topics: log.topics.slice(0, 3) }, TRANSFER_TOPIC)).toBeNull();
  });
});

describe("holdings", () => {
  it("counts a mint straight into the wallet", () => {
    const holdings = deriveHoldings([transfer(zeroAddress, OWNER, 5)], OWNER);
    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({ tokenId: 5, mintedHere: true });
    expect(holdings[0].from).toBe(zeroAddress);
  });

  it("drops a token that was sent away", () => {
    const holdings = deriveHoldings(
      [transfer(zeroAddress, OWNER, 5, 100), transfer(OWNER, OTHER, 5, 200)],
      OWNER,
    );
    expect(holdings).toEqual([]);
  });

  it("brings a token back when it is received again", () => {
    const holdings = deriveHoldings(
      [
        transfer(zeroAddress, OWNER, 5, 100),
        transfer(OWNER, OTHER, 5, 200),
        transfer(OTHER, OWNER, 5, 300),
      ],
      OWNER,
    );
    expect(holdings.map((holding) => holding.tokenId)).toEqual([5]);
    expect(holdings[0].mintedHere).toBe(false);
    expect(holdings[0].from).toBe(OTHER);
  });

  it("ignores tokens that never belonged to the wallet", () => {
    const holdings = deriveHoldings([transfer(OTHER, OTHER, 9)], OWNER);
    expect(holdings).toEqual([]);
  });

  it("orders newest token first", () => {
    const holdings = deriveHoldings(
      [transfer(zeroAddress, OWNER, 1), transfer(zeroAddress, OWNER, 4), transfer(zeroAddress, OWNER, 2)],
      OWNER,
    );
    expect(holdings.map((holding) => holding.tokenId)).toEqual([4, 2, 1]);
  });

  it("uses log index to break a tie inside one block", () => {
    const holdings = deriveHoldings(
      [transfer(zeroAddress, OWNER, 3, 100, 1), transfer(OWNER, OTHER, 3, 100, 2)],
      OWNER,
    );
    expect(holdings).toEqual([]);
  });

  it("is case insensitive about the owner", () => {
    const holdings = deriveHoldings([transfer(zeroAddress, OWNER, 5)], OWNER.toLowerCase() as typeof OWNER);
    expect(holdings).toHaveLength(1);
  });
});

describe("activity", () => {
  const mints: MintEvent[] = [
    {
      tokenId: 5,
      minter: OWNER,
      freeMint: true,
      pricePaid: 0n,
      blockNumber: 100,
      transactionHash: `0x${(100).toString(16).padStart(8, "0")}${"cd".repeat(28)}`,
    },
  ];

  it("labels a transfer from the zero address as a mint and attaches the price", () => {
    const activity = buildActivity([transfer(zeroAddress, OWNER, 5, 100)], mints, OWNER);
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ kind: "mint", tokenId: 5, freeMint: true, pricePaid: 0n });
  });

  it("labels incoming and outgoing transfers with the counterparty", () => {
    const incoming = buildActivity([transfer(OTHER, OWNER, 3, 120)], [], OWNER);
    expect(incoming[0]).toMatchObject({ kind: "in", counterparty: OTHER });

    const outgoing = buildActivity([transfer(OWNER, OTHER, 3, 130)], [], OWNER);
    expect(outgoing[0]).toMatchObject({ kind: "out", counterparty: OTHER });
  });

  it("sorts newest first, using the log index within a block", () => {
    const activity = buildActivity(
      [
        transfer(zeroAddress, OWNER, 1, 100, 0),
        transfer(zeroAddress, OWNER, 2, 300, 0),
        transfer(zeroAddress, OWNER, 3, 300, 5),
      ],
      [],
      OWNER,
    );
    expect(activity.map((item) => item.tokenId)).toEqual([3, 2, 1]);
  });

  it("leaves the price undefined when no mint event matched", () => {
    const activity = buildActivity([transfer(zeroAddress, OWNER, 9, 100)], [], OWNER);
    expect(activity[0].freeMint).toBeUndefined();
  });
});

describe("de-duplication and summary", () => {
  it("removes logs repeated by overlapping queries", () => {
    const one = transfer(zeroAddress, OWNER, 5, 100, 1);
    expect(dedupeTransfers([one, { ...one }, transfer(zeroAddress, OWNER, 6, 100, 2)])).toHaveLength(2);
  });

  it("counts each kind of movement", () => {
    const activity = buildActivity(
      [
        transfer(zeroAddress, OWNER, 1, 100),
        transfer(zeroAddress, OWNER, 2, 110),
        transfer(OTHER, OWNER, 3, 120),
        transfer(OWNER, OTHER, 2, 130),
      ],
      [],
      OWNER,
    );
    expect(summarise(activity)).toEqual({ mints: 2, inbound: 1, outbound: 1 });
  });
});
