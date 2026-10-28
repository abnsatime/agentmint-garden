# AgentMint Garden

AgentMint Garden is a BNB Smart Chain NFT learning project built with Foundry and OpenZeppelin Contracts. The first version focuses on a small, auditable minting policy and deterministic onchain metadata.

## Mint policy

- ERC-721 collection: `AgentMint Garden` (`GARDEN`)
- maximum supply: 2,000 NFTs
- token IDs 1–1,000: free mint
- token IDs 1,001–2,000: fixed-price mint
- maximum 2 NFTs per wallet across the full collection
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

## Deployment preparation

Copy the ignored environment file and configure the owner and paid-phase price in wei:

```bash
cp .env.example .env
source .env

forge script script/DeployAgentMintGarden.s.sol:DeployAgentMintGarden \
  --rpc-url "$BSC_TESTNET_RPC_URL" \
  --sender "$NFT_OWNER"
```

The command above is a simulation only. Broadcasting and source verification will be added after local tests and a funded BSC Testnet deployment account are ready.

## Roadmap

1. Contract policy and boundary tests
2. BSC Testnet deployment and BscScan verification
3. Responsive mint/gallery DApp
4. Metadata trait selection
5. Binance Wallet connection testing
6. Agentic Wallet mainnet adapter only after BSC Testnet validation

Binance Agentic Wallet is deliberately deferred because its current BSC integration targets mainnet chain ID 56 rather than BSC Testnet chain ID 97.

## Disclaimer

This is an educational testnet project, not a financial product. It has not been audited.
