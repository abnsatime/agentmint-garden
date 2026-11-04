import { isAddress, type Address } from "viem";

/** The listing contract for the garden collection on BSC Testnet. */
const referenceMarket: Address = "0x153bbf8fc8eD31ab8e73d9b5AE3076d73d3424e2";
const configuredMarket = process.env.NEXT_PUBLIC_MARKET_ADDRESS;

export const marketAddress: Address = isAddress(configuredMarket ?? "")
  ? (configuredMarket as Address)
  : referenceMarket;

export const marketExplorerUrl = `https://testnet.bscscan.com/address/${marketAddress}`;

/** Block the market was created in; the log scan starts here instead of block 0. */
export const MARKET_DEPLOYMENT_BLOCK = BigInt(
  process.env.NEXT_PUBLIC_MARKET_DEPLOYMENT_BLOCK ?? "140688854",
);

/**
 * Indicative BNB/USD rate. Testnet tBNB has no value; this exists so a listing price can be
 * expressed in the "about one dollar" unit the collection is priced in.
 */
const configuredRate = Number(process.env.NEXT_PUBLIC_BNB_USD_RATE ?? "650");
export const bnbUsdRate = Number.isFinite(configuredRate) && configuredRate > 0 ? configuredRate : 650;

export const marketAbi = [
  {
    type: "function",
    name: "collection",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "listingOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "seller", type: "address" },
      { name: "price", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "list",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "price", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "updatePrice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "price", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancel",
    stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "event",
    name: "Listed",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "price", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PriceUpdated",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "price", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Cancelled",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "seller", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Sold",
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "price", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "MarketZeroPrice", inputs: [] },
  { type: "error", name: "MarketNotOwner", inputs: [] },
  { type: "error", name: "MarketNotApproved", inputs: [] },
  { type: "error", name: "MarketAlreadyListed", inputs: [] },
  { type: "error", name: "MarketNotListed", inputs: [] },
  { type: "error", name: "MarketNotSeller", inputs: [] },
  { type: "error", name: "MarketSelfPurchase", inputs: [] },
  {
    type: "error",
    name: "MarketIncorrectPayment",
    inputs: [
      { name: "required", type: "uint256" },
      { name: "supplied", type: "uint256" },
    ],
  },
  { type: "error", name: "MarketStaleListing", inputs: [] },
  { type: "error", name: "MarketTransferFailed", inputs: [] },
  { type: "error", name: "MarketSellerCannotReceive", inputs: [] },
] as const;
