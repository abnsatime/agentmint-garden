# AgentMint Garden

AgentMint Garden is a BNB Smart Chain NFT learning project built with Foundry and OpenZeppelin Contracts. The first version focuses on a small, auditable minting policy and deterministic onchain metadata. It is deployed on BNB Smart Chain Testnet (chain ID `97`); see [Deployment](#deployment).

## Mint policy

- ERC-721 collection: `AgentMint Garden` (`GARDEN`)
- maximum supply: 2,000 NFTs
- token IDs 1–1,000: free mint
- token IDs 1,001–2,000: fixed-price mint
- maximum 2 mints per wallet, enforced at mint time; the cap does not limit how many
  NFTs a wallet may hold later through transfers or secondary purchases
- exact payment is required; the contract does not retain accidental overpayment
- owner may pause minting and withdraw proceeds
- metadata and SVG image are generated onchain

The free boundary is calculated per token. If supply is 999 and a wallet mints two NFTs, token 1,000 is free and token 1,001 costs one `mintPrice`.

## Network

Development targets BNB Smart Chain Testnet:

| Field | Value |
|---|---|
| Chain ID | `97` |
| Native gas token | `tBNB` |
| RPC | `https://bsc-testnet-dataseed.bnbchain.org` |
| Explorer | <https://testnet.bscscan.com/> |

tBNB has no monetary value. Never send mainnet BNB to a testnet address or faucet.

## Deployment

Deployed to BSC Testnet on 2026-11-03. The machine-readable record lives in
[`deployments/bsc-testnet.json`](deployments/bsc-testnet.json); the values below mirror it.

| Field | Value |
|---|---|
| Contract | `AgentMintGarden` at [`0x5bEd1F9d23FaFdE1A4b81215a2888812494d4107`](https://testnet.bscscan.com/address/0x5bEd1F9d23FaFdE1A4b81215a2888812494d4107) |
| Chain ID | `97` (BNB Smart Chain Testnet) |
| Deploy transaction | [`0x00c6d9a46e52a0d26943dcb744a19e60497cfda5fa31d74b17132aa4731b69c0`](https://testnet.bscscan.com/tx/0x00c6d9a46e52a0d26943dcb744a19e60497cfda5fa31d74b17132aa4731b69c0) |
| Block | `140503064`, mined 2026-11-03T03:39:54Z (11:39:54 +08:00) |
| Deployer | `0xF040275C3e38Cb018C491BC8a5A5437D86178A67` |
| `initialOwner` | `0xF040275C3e38Cb018C491BC8a5A5437D86178A67` |
| `paidMintPrice` | `1000000000000000` wei (0.001 tBNB) |
| Gas used | `1,839,538` of `2,319,131` limit at 0.132 gwei |
| Fee paid | `0.000242819016` tBNB |
| Compiler | solc `0.8.26`, optimizer on, 200 runs, `evmVersion` cancun, `viaIR` false |
| Runtime bytecode | `7,685` bytes, keccak256 `0xdbcb2b24fb8983a10a1a546f215df3a7909abbca52e49dec126251154156a105` |
| Source commit | `8f881e5` on `main`, working tree clean |
| Source verification | [`Pass - Verified`](https://testnet.bscscan.com/address/0x5bEd1F9d23FaFdE1A4b81215a2888812494d4107#code) on 2026-11-03 (exact match) |

At deployment `totalSupply()` was `0` and `paused()` was `false`, so the collection is
currently open for minting.

BscScan reports `Pass - Verified`, an exact bytecode match against the submitted source,
optimizer settings and constructor arguments. The same conclusion follows independently
from a local `forge build` of commit `8f881e5`: both artifacts are 7,685 bytes and differ
in exactly 18 bytes, all of them the `mintPrice` immutable value, and patching those bytes
into the local artifact reproduces the on-chain keccak256 exactly.

## Development

Requirements: Foundry 1.8 or newer.

```bash
forge fmt --check
forge build --sizes
forge test -vvv
```

Inspect the public ABI:

```bash
forge inspect AgentMintGarden abi
```

## Deploying

The collection is already live on BSC Testnet and the parameters of that deployment are
recorded in [Deployment](#deployment). To simulate, or to send a fresh deployment from a
different account, copy the ignored environment file and set the owner and the paid-phase
price in wei:

```bash
cp .env.example .env
source .env

forge script script/DeployAgentMintGarden.s.sol:DeployAgentMintGarden \
  --rpc-url "$BSC_TESTNET_RPC_URL" \
  --sender "$NFT_OWNER"
```

Without `--broadcast` the command only simulates. Add `--broadcast` to send the transaction:
`NFT_OWNER` becomes the contract owner and must be funded on chain `97`, and
`PAID_MINT_PRICE` is the paid-phase price in wei.

The deployment recorded in [`deployments/bsc-testnet.json`](deployments/bsc-testnet.json) was
broadcast on 2026-11-03, is confirmed on chain, and its source is verified on BscScan.

## Frontend

The mint DApp lives in [`web/`](web/README.md): a Next.js 16 static export using wagmi and
viem, wired to the deployed contract.

```bash
cd web
pnpm install
pnpm dev     # iterate here; forward port 3000 to your browser if you work from Windows
pnpm build   # static export into web/out
```

Five routes are exported. Pushes to `main` publish them to GitHub Pages at
<https://abnsatime.github.io/agentmint-garden/>:

| Route | What it is |
|---|---|
| `/` | landing page |
| `/mint` | mint flow: live quote, gas estimate, exact payment |
| `/gallery` | every minted token, its artwork and mint provenance |
| `/me` | the connected wallet's holdings, mint history and transfers, plus listing controls |
| `/market` | the fixed-price order book, buy and sell |

The mint flow reads supply, price, wallet allowance and pause state from chain, re-quotes with
`quoteMintPrice` immediately before signing so the exact payment always matches the contract's
requirement, previews the artwork of the next token with the same hue rule `tokenURI` uses, and
renders the real on-chain metadata once a mint confirms.

## Market

`AgentMintMarket` (`0x153bbf8fc8eD31ab8e73d9b5AE3076d73d3424e2`) is a separate fixed-price
listing contract: the collection itself has no trading logic.

- a listing is an **approval, not an escrow** — the token stays in the seller's wallet until it
  sells, so listing costs one `approve` and the seller keeps using the token
- `buy` takes the exact ask, transfers the token and forwards the full amount to the seller in
  the same transaction; the market charges no fee and never holds funds
- `list`, `updatePrice` and `cancel` are seller-only; a listing whose seller moved the token
  away reverts with `MarketStaleListing` instead of failing inside `transferFrom`

The record lives in [`deployments/bsc-testnet-market.json`](deployments/bsc-testnet-market.json).
Dollar hints in the UI use a configured rate (`NEXT_PUBLIC_BNB_USD_RATE`); testnet tBNB has no
value, so they are indicative only.

Source verification: **verified** on BscScan (`Pass - Verified`) and on Sourcify
(`exact_match` for creation and runtime bytecode).

One change on `main` is **not deployed**: `buy` now uses `safeTransferFrom`, so a contract
buyer that does not implement `onERC721Received` gets a reverted purchase instead of taking
custody of a token it could never move. The deployed contract at the address above still uses
`transferFrom`; re-deploy to pick the hardening up.

## Indexer

[`indexer/`](indexer/README.md) is the service that will replace the browser-side log scans
behind `/gallery`, `/me` and `/market`: Node.js, Fastify, PostgreSQL and Drizzle ORM, with
Docker Compose for the database.

It syncs both contracts into raw event tables with a per-stream cursor, commits each block
window together with its cursor, and serves a read API — `/tokens`, `/tokens/:id`,
`/market/listings`, `/market/sales`, `/activity` — plus `/health` and `/sync/status`. The
frontend still scans logs itself for now.

```bash
cd indexer
pnpm install && cp .env.example .env
pnpm db:up && pnpm db:migrate
pnpm sync       # scan the chain once
pnpm dev        # http://127.0.0.1:8081/health
```

## Roadmap

1. Contract policy and boundary tests
2. BSC Testnet deployment and BscScan verification (done 2026-11-03)
3. Responsive mint DApp (done 2026-11-03)
4. Gallery view of minted tokens (done 2026-11-03)
5. Metadata trait selection
6. Binance Wallet connection testing
7. Agentic Wallet mainnet adapter only after BSC Testnet validation

Binance Agentic Wallet is deliberately deferred because its current BSC integration targets mainnet chain ID 56 rather than BSC Testnet chain ID 97.

## Disclaimer

This is an educational testnet project, not a financial product. It has not been audited.
