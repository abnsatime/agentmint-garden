import { describe, expect, it } from "vitest";
import {
  BLOCKER_COPY,
  decodeMintError,
  decodeTokenUri,
  fallbackPolicy,
  formatTbnb,
  freeSupplyRemaining,
  hueForToken,
  maxQuantity,
  mintBlocker,
  mintedIdsFor,
  paidQuantityFor,
  previewSvg,
  readyLabel,
  requiredPayment,
  svgDataUri,
  zeroAddress,
  type GateInput,
} from "./mint";

const PRICE = 1_000_000_000_000_000n; // 0.001 tBNB
const policy = fallbackPolicy;

function gate(overrides: Partial<GateInput> = {}): GateInput {
  return {
    isConnected: true,
    chainId: 97,
    expectedChainId: 97,
    paused: false,
    supply: 0n,
    mintedBy: 0n,
    policy,
    price: PRICE,
    quantity: 1,
    balance: 10n * 10n ** 18n,
    ...overrides,
  };
}

describe("pricing mirror", () => {
  it("charges nothing inside the free phase", () => {
    expect(requiredPayment(0n, 1n, PRICE, 1_000n)).toBe(0n);
    expect(requiredPayment(998n, 2n, PRICE, 1_000n)).toBe(0n);
  });

  it("charges only the tokens past the boundary in a crossing mint", () => {
    // supply 999 + 2 tokens => token 1000 free, token 1001 paid
    expect(requiredPayment(999n, 2n, PRICE, 1_000n)).toBe(PRICE);
    expect(paidQuantityFor(999n, 2n, 1_000n)).toBe(1n);
  });

  it("charges every token once the free phase is over", () => {
    expect(requiredPayment(1_000n, 1n, PRICE, 1_000n)).toBe(PRICE);
    expect(requiredPayment(1_500n, 2n, PRICE, 1_000n)).toBe(2n * PRICE);
    expect(requiredPayment(1_999n, 2n, PRICE, 1_000n)).toBe(2n * PRICE);
  });

  it("treats a zero quantity as free", () => {
    expect(requiredPayment(1_500n, 0n, PRICE, 1_000n)).toBe(0n);
  });

  it("counts the free phase down and then stays at zero", () => {
    expect(freeSupplyRemaining(0n, 1_000n)).toBe(1_000n);
    expect(freeSupplyRemaining(999n, 1_000n)).toBe(1n);
    expect(freeSupplyRemaining(1_000n, 1_000n)).toBe(0n);
    expect(freeSupplyRemaining(1_500n, 1_000n)).toBe(0n);
  });
});

describe("wallet and supply caps", () => {
  it("gives a fresh wallet two mints", () => {
    expect(maxQuantity(0n, 0n, policy)).toBe(2n);
  });

  it("shrinks to the remaining wallet allowance", () => {
    expect(maxQuantity(0n, 1n, policy)).toBe(1n);
    expect(maxQuantity(0n, 2n, policy)).toBe(0n);
  });

  it("shrinks to the remaining supply", () => {
    expect(maxQuantity(1_999n, 0n, policy)).toBe(1n);
    expect(maxQuantity(2_000n, 0n, policy)).toBe(0n);
  });

  it("takes the tighter of the two caps", () => {
    expect(maxQuantity(1_999n, 1n, policy)).toBe(1n);
    expect(maxQuantity(2_000n, 2n, policy)).toBe(0n);
  });
});

describe("mint gate", () => {
  it("blocks when disconnected, before anything else", () => {
    expect(mintBlocker(gate({ isConnected: false, paused: true }))).toBe("connect");
  });

  it("asks for a network switch before reporting contract state", () => {
    expect(mintBlocker(gate({ chainId: 56, paused: true }))).toBe("network");
  });

  it("reports a pause", () => {
    expect(mintBlocker(gate({ paused: true }))).toBe("paused");
  });

  it("reports a sold-out collection", () => {
    expect(mintBlocker(gate({ supply: 2_000n }))).toBe("sold-out");
  });

  it("reports the per-wallet limit", () => {
    expect(mintBlocker(gate({ mintedBy: 2n }))).toBe("wallet-limit");
  });

  it("reports a zero quantity", () => {
    expect(mintBlocker(gate({ quantity: 0 }))).toBe("quantity");
  });

  it("blocks a zero-balance wallet that would owe money", () => {
    expect(mintBlocker(gate({ supply: 1_200n, balance: 0n }))).toBe("insufficient-balance");
  });

  it("allows a zero-balance wallet to claim a free mint", () => {
    expect(mintBlocker(gate({ supply: 10n, balance: 0n }))).toBe("none");
  });

  it("allows a funded wallet to pay", () => {
    expect(mintBlocker(gate({ supply: 1_200n, balance: 10n ** 18n }))).toBe("none");
  });

  it("has copy for every blocker", () => {
    for (const blocker of [
      "none",
      "connect",
      "network",
      "paused",
      "sold-out",
      "wallet-limit",
      "quantity",
      "insufficient-balance",
    ] as const) {
      expect(BLOCKER_COPY[blocker].label.length).toBeGreaterThan(0);
    }
  });
});

describe("call to action copy", () => {
  it("says free while the free phase lasts", () => {
    expect(readyLabel({ supply: 10n, quantity: 2, price: PRICE, freeSupply: 1_000n })).toBe(
      "Claim 2 free",
    );
  });

  it("spells out the price after the boundary", () => {
    expect(readyLabel({ supply: 1_200n, quantity: 2, price: PRICE, freeSupply: 1_000n })).toBe(
      "Mint 2 for 0.002 tBNB",
    );
  });

  it("splits a crossing mint into free and paid parts", () => {
    expect(readyLabel({ supply: 999n, quantity: 2, price: PRICE, freeSupply: 1_000n })).toBe(
      "Claim 1 free + mint 1 for 0.001 tBNB",
    );
  });
});

describe("formatting", () => {
  it("formats wei without floating point drift", () => {
    expect(formatTbnb(0n)).toBe("0");
    expect(formatTbnb(PRICE)).toBe("0.001");
    expect(formatTbnb(10n ** 18n)).toBe("1");
    expect(formatTbnb(1n)).toBe("0.000000000000000001");
    expect(formatTbnb(2n * PRICE)).toBe("0.002");
  });
});

describe("error decoding", () => {
  it("recognises a wallet rejection", () => {
    expect(decodeMintError({ code: 4001, message: "User rejected the request." })).toContain(
      "rejected",
    );
  });

  it("recognises a custom error nested in the cause chain", () => {
    const error = {
      name: "ContractFunctionExecutionError",
      message: "execution reverted",
      cause: {
        name: "ContractFunctionRevertedError",
        data: { errorName: "AgentMintGardenWalletLimit" },
      },
    };
    expect(decodeMintError(error)).toContain("per-wallet limit");
  });

  it("recognises a sold-out revert", () => {
    expect(decodeMintError(new Error("reverted with AgentMintGardenMaxSupply(2000, 1)"))).toContain(
      "sold out",
    );
  });

  it("recognises an underfunded wallet", () => {
    expect(decodeMintError(new Error("insufficient funds for gas * price + value"))).toContain(
      "enough tBNB",
    );
  });

  it("falls back to a neutral sentence", () => {
    expect(decodeMintError({})).toContain("could not be completed");
  });
});

describe("on-chain artwork", () => {
  it("derives a hue inside the wheel for every token", () => {
    for (const id of [1n, 2n, 999n, 1_000n, 2_000n]) {
      const hue = hueForToken(id);
      expect(Number.isInteger(hue)).toBe(true);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("is deterministic and differs between neighbouring tokens", () => {
    expect(hueForToken(1n)).toBe(hueForToken(1n));
    expect(hueForToken(1n)).not.toBe(hueForToken(2n));
  });

  it("renders the same SVG skeleton as the contract", () => {
    const svg = previewSvg(1_000n);
    expect(svg).toContain(`fill="hsl(${hueForToken(1_000n)},70%,18%)"`);
    expect(svg).toContain('stroke="#A8FF78" stroke-width="18"');
    expect(svg).toContain("GARDEN #1000");
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">')).toBe(
      true,
    );
  });

  it("round-trips the token URI payload the contract returns", () => {
    const metadata = {
      name: "AgentMint Garden #1",
      description: "A deterministic onchain garden minted on BNB Smart Chain.",
      attributes: [{ trait_type: "Hue", value: "42" }],
      image: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    };
    const uri = `data:application/json;base64,${btoa(JSON.stringify(metadata))}`;
    expect(decodeTokenUri(uri)).toEqual(metadata);
  });

  it("returns null for something that is not an on-chain data URI", () => {
    expect(decodeTokenUri("https://example.com/1.json")).toBeNull();
    expect(decodeTokenUri(undefined)).toBeNull();
  });

  it("wraps svg into a renderable data uri", () => {
    expect(svgDataUri("<svg></svg>")).toBe("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=");
  });
});

describe("receipt parsing", () => {
  const owner = "0xF040275C3e38Cb018C491BC8a5A5437D86178A67" as const;

  it("picks the tokens minted to this wallet", () => {
    const ids = mintedIdsFor(
      [
        { from: zeroAddress, to: owner, tokenId: 1_001n },
        { from: zeroAddress, to: owner, tokenId: 1_002n },
      ],
      owner,
    );
    expect(ids).toEqual([1_001n, 1_002n]);
  });

  it("ignores transfers that are not fresh mints to this wallet", () => {
    const ids = mintedIdsFor(
      [
        { from: zeroAddress, to: "0x0000000000000000000000000000000000000001", tokenId: 5n },
        { from: "0x0000000000000000000000000000000000000001", to: owner, tokenId: 6n },
      ],
      owner,
    );
    expect(ids).toEqual([]);
  });

  it("returns nothing without an owner", () => {
    expect(mintedIdsFor([{ from: zeroAddress, to: owner, tokenId: 1n }], undefined)).toEqual([]);
  });
});
