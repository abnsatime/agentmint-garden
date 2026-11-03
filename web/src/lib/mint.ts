import { keccak256, toHex, type Address } from "viem";

/**
 * Pure rules of the collection. Everything here mirrors `src/AgentMintGarden.sol` so the
 * UI can explain the price before the wallet is even connected, and so the boundaries that
 * the Solidity test suite pins down are pinned down a second time on the client.
 */

export interface GardenPolicy {
  maxSupply: bigint;
  freeSupply: bigint;
  maxPerWallet: bigint;
}

/** Mirrors the constants of the deployed contract; replaced by on-chain reads at runtime. */
export const fallbackPolicy: GardenPolicy = {
  maxSupply: 2_000n,
  freeSupply: 1_000n,
  maxPerWallet: 2n,
};

export const zeroAddress = "0x0000000000000000000000000000000000000000" as const;

export function remainingSupply(supply: bigint, maxSupply: bigint) {
  return supply >= maxSupply ? 0n : maxSupply - supply;
}

export function freeSupplyRemaining(supply: bigint, freeSupply: bigint) {
  return supply >= freeSupply ? 0n : freeSupply - supply;
}

/** How many of a mint of `quantity` land after the free boundary and therefore cost money. */
export function paidQuantityFor(supply: bigint, quantity: bigint, freeSupply: bigint) {
  const free = freeSupplyRemaining(supply, freeSupply);
  return quantity > free ? quantity - free : 0n;
}

/** Exact `msg.value` the contract expects; it reverts on both underpayment and overpayment. */
export function requiredPayment(
  supply: bigint,
  quantity: bigint,
  price: bigint,
  freeSupply: bigint,
) {
  if (quantity <= 0n) return 0n;
  return paidQuantityFor(supply, quantity, freeSupply) * price;
}

/** Largest quantity this wallet could mint right now. */
export function maxQuantity(supply: bigint, mintedBy: bigint, policy: GardenPolicy) {
  const walletLeft = mintedBy >= policy.maxPerWallet ? 0n : policy.maxPerWallet - mintedBy;
  const supplyLeft = remainingSupply(supply, policy.maxSupply);
  return walletLeft < supplyLeft ? walletLeft : supplyLeft;
}

export type MintBlocker =
  | "none"
  | "connect"
  | "no-wallet"
  | "rpc"
  | "loading"
  | "network"
  | "paused"
  | "sold-out"
  | "wallet-limit"
  | "quantity"
  | "insufficient-balance";

export interface GateInput {
  isConnected: boolean;
  chainId?: number;
  expectedChainId: number;
  paused: boolean;
  supply: bigint;
  mintedBy: bigint;
  policy: GardenPolicy;
  price: bigint;
  quantity: number;
  balance?: bigint;
  pending?: boolean;
  /** False only when the page is certain no wallet is injected; unknown leaves it undefined. */
  walletAvailable?: boolean;
  /** True when a contract read failed, so price and supply cannot be trusted. */
  rpcError?: boolean;
  /** True before the first successful read, when price and supply are still unknown. */
  readPending?: boolean;
}

/**
 * Single source of truth for "can this button be pressed, and why not". Order matters:
 * the first blocking condition is the one worth telling the user about.
 */
export function mintBlocker(input: GateInput): MintBlocker {
  if (!input.isConnected && input.walletAvailable === false) return "no-wallet";
  if (!input.isConnected) return "connect";
  if (input.chainId !== undefined && input.chainId !== input.expectedChainId) return "network";
  // Everything below depends on reads that have not landed yet or just failed.
  if (input.rpcError) return "rpc";
  if (input.readPending) return "loading";
  if (input.paused) return "paused";
  if (remainingSupply(input.supply, input.policy.maxSupply) === 0n) return "sold-out";
  if (maxQuantity(input.supply, input.mintedBy, input.policy) === 0n) return "wallet-limit";
  if (input.quantity <= 0) return "quantity";
  const cost = requiredPayment(
    input.supply,
    BigInt(input.quantity),
    input.price,
    input.policy.freeSupply,
  );
  if (input.balance !== undefined && cost > 0n && input.balance <= cost) return "insufficient-balance";
  return "none";
}

export const BLOCKER_COPY: Record<MintBlocker, { label: string; detail: string }> = {
  none: { label: "Mint", detail: "" },
  connect: {
    label: "Connect a wallet",
    detail: "Pick the wallet that will own the NFT. Nothing is signed until you approve it.",
  },
  "no-wallet": {
    label: "No wallet detected",
    detail:
      "This browser is not exposing a wallet extension to the page. Install Binance Wallet or MetaMask, allow it on this site, leave private browsing, then reload.",
  },
  rpc: {
    label: "Contract unreachable",
    detail:
      "The read endpoint is not answering, so price and supply cannot be trusted right now. Retry in a moment.",
  },
  loading: {
    label: "Reading the contract…",
    detail: "Price and supply are still loading from the chain. The button unlocks as soon as they arrive.",
  },
  network: {
    label: "Switch to BSC Testnet",
    detail: "This collection lives on chain 97. Switching networks is free and does not move funds.",
  },
  paused: {
    label: "Minting is paused",
    detail: "The owner paused minting. The collection and any NFTs you already hold are unaffected.",
  },
  "sold-out": {
    label: "Sold out",
    detail: "All 2,000 plots are taken. Existing NFTs can still be traded on marketplaces.",
  },
  "wallet-limit": {
    label: "Wallet limit reached",
    detail: "Each wallet may mint twice. You can still receive NFTs by transfer or buy one second-hand.",
  },
  quantity: { label: "Choose a quantity", detail: "Mint one or two at a time." },
  "insufficient-balance": {
    label: "Not enough tBNB",
    detail: "Grab free testnet tBNB from a BNB Chain faucet, then try again.",
  },
};

export interface ReadyLabelInput {
  supply: bigint;
  quantity: number;
  price: bigint;
  freeSupply: bigint;
}

/** CTA text for the happy path: spells out free vs paid so no one is surprised at signing time. */
export function readyLabel({ supply, quantity, price, freeSupply }: ReadyLabelInput) {
  const paid = paidQuantityFor(supply, BigInt(quantity), freeSupply);
  const free = BigInt(quantity) - paid;
  if (paid === 0n) return `Claim ${quantity} free`;
  if (free === 0n) return `Mint ${quantity} for ${formatTbnb(paid * price)} tBNB`;
  return `Claim ${free} free + mint ${paid} for ${formatTbnb(paid * price)} tBNB`;
}

/**
 * Estimated network fee for a transaction. Returns null rather than a misleading zero when
 * either figure is missing.
 */
export function formatGasFee(gas?: bigint, gasPrice?: bigint): string | null {
  if (gas === undefined || gasPrice === undefined) return null;
  if (gas <= 0n || gasPrice <= 0n) return null;
  return formatTbnb(gas * gasPrice);
}

export function formatTbnb(value: bigint) {
  const base = 10n ** 18n;
  const whole = value / base;
  const fraction = (value % base).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/**
 * Maps whatever the wallet or the node throws into one sentence a visitor can act on.
 * Walks the `cause` chain because viem nests the useful part several levels deep.
 */
export function decodeMintError(error: unknown): string {
  const text = collectErrorText(error);

  const known: Array<[RegExp, string]> = [
    [/User rejected|User denied|4001/i, "You rejected the request in your wallet."],
    [
      /AgentMintGardenWalletLimit/,
      "This wallet already minted twice, which is the per-wallet limit.",
    ],
    [/AgentMintGardenMaxSupply/, "The collection sold out before your transaction landed."],
    [
      /AgentMintGardenIncorrectPayment/,
      "The price moved between the quote and the signature. Reload the quote and try again.",
    ],
    [/AgentMintGardenZeroQuantity/, "Choose at least one NFT before minting."],
    [/EnforcedPause/, "Minting was paused by the owner before your transaction landed."],
    [/ERC721InvalidReceiver/, "That wallet contract cannot receive NFTs."],
    [/ERC721NonexistentToken/, "That token has not been minted yet."],
    [/OwnableUnauthorizedAccount/, "Only the contract owner can do that."],
    [/insufficient funds/i, "This wallet does not hold enough tBNB for the price plus gas."],
    [
      /chain.*(mismatch|not supported)|Unsupported chain|does not match the target chain/i,
      "Your wallet is on another network. Switch it to BSC Testnet and try again.",
    ],
  ];

  for (const [pattern, message] of known) {
    if (pattern.test(text)) return message;
  }
  return "The transaction could not be completed. Please try again.";
}

function collectErrorText(error: unknown, depth = 0, seen = new Set<unknown>()): string {
  if (!error || depth > 6 || seen.has(error)) return "";
  seen.add(error);

  const parts: string[] = [];
  if (typeof error === "string") {
    parts.push(error);
    return parts.join(" ");
  }
  if (typeof error !== "object") return "";

  const record = error as Record<string, unknown>;
  for (const key of ["name", "shortMessage", "message", "details"]) {
    const value = record[key];
    if (typeof value === "string" && value) parts.push(value);
  }
  for (const key of ["errorName", "reason"]) {
    const value = record[key];
    if (typeof value === "string" && value) parts.push(value);
  }
  const data = record.data;
  if (typeof data === "string") parts.push(data);
  if (data && typeof data === "object") {
    const errorName = (data as Record<string, unknown>).errorName;
    if (typeof errorName === "string") parts.push(errorName);
  }

  for (const key of ["cause", "error", "data"]) {
    const nested = record[key];
    if (nested && typeof nested === "object") {
      parts.push(collectErrorText(nested, depth + 1, seen));
    }
  }
  return parts.filter(Boolean).join(" ");
}

export interface ParsedTransfer {
  from: Address;
  to: Address;
  tokenId: bigint;
}

/** Token IDs this wallet actually received in a mint, taken from the Transfer logs. */
export function mintedIdsFor(transfers: ParsedTransfer[], owner?: Address) {
  if (!owner) return [] as bigint[];
  const target = owner.toLowerCase();
  return transfers
    .filter(
      (transfer) =>
        transfer.from.toLowerCase() === zeroAddress && transfer.to.toLowerCase() === target,
    )
    .map((transfer) => transfer.tokenId);
}

/**
 * The contract paints each token from `keccak256(abi.encodePacked(tokenId)) % 360`, so the
 * UI can preview the exact artwork of an unminted token — no extra RPC call, no IPFS.
 */
export function hueForToken(tokenId: bigint) {
  const hash = keccak256(toHex(tokenId, { size: 32 }));
  return Number(BigInt(hash) % 360n);
}

/** Byte-for-byte equivalent of `tokenURI`'s SVG, so a preview matches the real mint. */
export function previewSvg(tokenId: bigint) {
  const hue = hueForToken(tokenId);
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640">' +
    `<rect width="640" height="640" fill="hsl(${hue},70%,18%)"/>` +
    '<circle cx="320" cy="300" r="190" fill="none" stroke="#A8FF78" stroke-width="18"/>' +
    '<path d="M220 350 Q320 150 420 350 Q320 470 220 350Z" fill="#A8FF78"/>' +
    `<text x="320" y="565" text-anchor="middle" fill="white" font-family="monospace" font-size="34">GARDEN #${tokenId}</text>` +
    "</svg>"
  );
}

export function svgDataUri(svg: string) {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export interface TokenMetadata {
  name?: string;
  description?: string;
  image?: string;
  attributes?: Array<{ trait_type: string; value: string }>;
}

/** Unpacks the on-chain `data:application/json;base64,` token URI. */
export function decodeTokenUri(uri?: string): TokenMetadata | null {
  if (!uri) return null;
  const prefix = "data:application/json;base64,";
  if (!uri.startsWith(prefix)) return null;
  try {
    return JSON.parse(atob(uri.slice(prefix.length))) as TokenMetadata;
  } catch {
    return null;
  }
}
