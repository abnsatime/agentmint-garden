# AgentMint Garden — mint DApp

Static Next.js frontend for the `AgentMintGarden` ERC-721 collection on BNB Smart Chain
Testnet (chain ID `97`). It reads every price and supply figure from the contract and mints
with an exact payment, so the wallet only ever signs a transaction the contract will accept.

## Stack

Next.js 16 (app router, static export), React 19, wagmi 3 + viem 2, TanStack Query,
Tailwind CSS 4. Wallet connection uses the injected provider through EIP-6963 discovery, so
Binance Wallet, MetaMask and other injected wallets all show up without custom adapters.

## Commands

```bash
pnpm install
pnpm dev        # http://127.0.0.1:3000
pnpm build      # static export to out/
pnpm lint
pnpm typecheck
pnpm test       # vitest unit tests for the pure mint logic
```

## Configuration

Copy `.env.example` to `.env` when pointing the app at another deployment. Both values have
in-tree fallbacks, so the app works against the recorded BSC Testnet deployment without any
environment file.

| Variable | Meaning |
|---|---|
| `NEXT_PUBLIC_BSC_TESTNET_RPC_URL` | Read-only JSON-RPC endpoint |
| `NEXT_PUBLIC_CONTRACT_ADDRESS` | `AgentMintGarden` address |
| `NEXT_PUBLIC_DEPLOYMENT_BLOCK` | Block the contract was created in |

## Structure

```
src/app/page.tsx    landing page: hero, live stats, policy, call to action
src/app/mint/       the mint route: stats, quantity stepper, artwork preview, transaction states
src/app/gallery/    the gallery route: every minted token, read from tokenURI and GardenMinted logs
src/app/me/         the wallet route: holdings, mint history, transfers in and out, traits
src/app/            layout, providers, globals.css (design tokens)
src/lib/contracts   address, ABI subset, explorer links
src/lib/mint        pure logic: pricing mirror, gate states, error decoding, art preview
src/lib/use-garden  one hook that owns every contract read
src/lib/use-wallet-chain  wallet network truth, switch and add-chain fallback
src/components/     header, footer, wallet button, stats, mint panel, art preview, policy
```

Routes are exported statically: `/` is the landing page, `/mint` is the mint flow,
`/gallery` lists every minted token and `/me` shows what the connected wallet holds. Public endpoints cap `eth_getLogs` spans, so the gallery
pages through logs in windows rather than issuing one wide query.

`src/lib/mint.ts` mirrors the on-chain pricing rule and the on-chain SVG generator, which is
what makes it testable without a node: the unit tests assert the same boundaries the Solidity
tests do (free supply cut-over, per-wallet cap, exact payment).
