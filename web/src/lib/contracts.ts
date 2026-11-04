import { isAddress, type Address } from "viem";

const referenceAddress: Address = "0x5bEd1F9d23FaFdE1A4b81215a2888812494d4107";
const configuredAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;

export const gardenAddress: Address = isAddress(configuredAddress ?? "")
  ? (configuredAddress as Address)
  : referenceAddress;

export const deploymentBlock = BigInt(
  process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK ?? "140503064",
);

export const explorerBaseUrl = "https://testnet.bscscan.com";
export const contractExplorerUrl = `${explorerBaseUrl}/address/${gardenAddress}`;
export const transactionExplorerUrl = (hash: string) => `${explorerBaseUrl}/tx/${hash}`;
export const tokenExplorerUrl = (tokenId: bigint) =>
  `${explorerBaseUrl}/token/${gardenAddress}?a=${tokenId.toString()}`;

/**
 * Only the surface the app actually touches. Kept in sync with the deployed contract
 * (verified on BscScan, compiler 0.8.26, chain 97).
 */
export const agentMintGardenAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "totalSupply",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "MAX_SUPPLY",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "FREE_SUPPLY",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "MAX_PER_WALLET",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "mintPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "mintedBy",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "quantity", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "tokenId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getApproved",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
  {
    type: "function",
    name: "quoteMintPrice",
    stateMutability: "view",
    inputs: [{ name: "quantity", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "payable",
    inputs: [{ name: "quantity", type: "uint256" }],
    outputs: [],
  },
  {
    type: "event",
    name: "GardenMinted",
    inputs: [
      { name: "minter", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "freeMint", type: "bool", indexed: false },
      { name: "pricePaid", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ],
  },
  { type: "error", name: "AgentMintGardenZeroQuantity", inputs: [] },
  {
    type: "error",
    name: "AgentMintGardenWalletLimit",
    inputs: [
      { name: "minted", type: "uint256" },
      { name: "requested", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "AgentMintGardenMaxSupply",
    inputs: [
      { name: "currentSupply", type: "uint256" },
      { name: "requested", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "AgentMintGardenIncorrectPayment",
    inputs: [
      { name: "required", type: "uint256" },
      { name: "supplied", type: "uint256" },
    ],
  },
  { type: "error", name: "AgentMintGardenWithdrawFailed", inputs: [] },
  { type: "error", name: "AgentMintGardenZeroRecipient", inputs: [] },
  { type: "error", name: "EnforcedPause", inputs: [] },
  { type: "error", name: "ExpectedPause", inputs: [] },
  {
    type: "error",
    name: "ERC721InvalidReceiver",
    inputs: [{ name: "receiver", type: "address" }],
  },
  {
    type: "error",
    name: "ERC721NonexistentToken",
    inputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [{ name: "account", type: "address" }],
  },
  { type: "error", name: "ReentrancyGuardReentrantCall", inputs: [] },
] as const;
