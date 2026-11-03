"use client";

import { useEffect, useMemo, useState } from "react";
import { parseEventLogs } from "viem";
import { readContract } from "wagmi/actions";
import {
  useAccount,
  useConfig,
  useConnect,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { useWalletChain } from "@/lib/use-wallet-chain";
import { ArtPreview } from "./art-preview";
import { MintedToken } from "./minted-token";
import { agentMintGardenAbi, gardenAddress, transactionExplorerUrl } from "@/lib/contracts";
import {
  BLOCKER_COPY,
  decodeMintError,
  formatTbnb,
  maxQuantity,
  mintBlocker,
  mintedIdsFor,
  paidQuantityFor,
  readyLabel,
  requiredPayment,
  type ParsedTransfer,
} from "@/lib/mint";
import { useGarden } from "@/lib/use-garden";

function friendlyConnectError(error: Error) {
  const message = error.message;
  if (/provider not found|no provider|provider is not/i.test(message)) {
    return "No wallet extension was detected. Install Binance Wallet or MetaMask, then reload this page.";
  }
  if (/rejected|denied|4001/i.test(message)) return "You closed the wallet request.";
  return message.split("\n")[0];
}

export function MintPanel() {
  const { address, isConnected } = useAccount();
  const { supply, price, policy, paused, mintedBy, balance, refetchAll } = useGarden();
  const { chainId: walletChainId, switchToTestnet } = useWalletChain();
  const config = useConfig();

  const [requestedQuantity, setRequestedQuantity] = useState(1);
  const [problem, setProblem] = useState<string | null>(null);
  const [showWallets, setShowWallets] = useState(false);
  const { connectors, connect, isPending: isConnecting, error: connectError } = useConnect();

  const {
    writeContractAsync,
    data: hash,
    error: writeError,
    isPending: isSigning,
    reset: resetWrite,
  } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  // Derived, not synced: the caps move as supply is minted, and a stale quantity must
  // collapse into the allowed range without an effect fighting the render.
  const spendable = maxQuantity(supply, mintedBy, policy);
  const upperBound = Number(spendable) > 0 ? Number(spendable) : 1;
  const quantity = Math.min(Math.max(1, requestedQuantity), upperBound);

  const quoteRead = useReadContract({
    address: gardenAddress,
    abi: agentMintGardenAbi,
    functionName: "quoteMintPrice",
    args: [BigInt(quantity)],
  });

  const localQuote = requiredPayment(supply, BigInt(quantity), price, policy.freeSupply);
  const quote = quoteRead.data ?? localQuote;
  const paidPart = paidQuantityFor(supply, BigInt(quantity), policy.freeSupply);
  const freePart = BigInt(quantity) - paidPart;

  const blocker = mintBlocker({
    isConnected,
    chainId: walletChainId,
    expectedChainId: bscTestnet.id,
    paused,
    supply,
    mintedBy,
    policy,
    price,
    quantity,
    balance,
  });
  const copy = BLOCKER_COPY[blocker];
  // A wrong network and a missing connection are both things the button itself can fix,
  // so it stays clickable for those; every other blocker is a state the visitor cannot
  // change from here.
  const actionable = blocker === "none" || blocker === "network" || blocker === "connect";

  const pending = isSigning || receipt.isLoading;
  const succeeded = receipt.isSuccess && receipt.data?.status === "success";
  const reverted = receipt.isSuccess && receipt.data?.status === "reverted";

  const label = pending
    ? isSigning
      ? "Confirm in your wallet…"
      : "Waiting for the block…"
    : isConnecting
      ? "Opening wallet…"
      : blocker === "none"
        ? readyLabel({ supply, quantity, price, freeSupply: policy.freeSupply })
        : copy.label;

  const mintedIds = useMemo(() => {
    const logs = receipt.data?.logs;
    if (!logs || logs.length === 0) return [] as bigint[];
    const parsed = parseEventLogs({ abi: agentMintGardenAbi, logs, eventName: "Transfer" });
    return mintedIdsFor(
      parsed.map((entry) => entry.args as unknown as ParsedTransfer),
      address,
    );
  }, [receipt.data, address]);

  useEffect(() => {
    if (succeeded) refetchAll();
  }, [succeeded, refetchAll]);

  async function handleClick() {
    setProblem(null);
    if (blocker === "connect") {
      if (connectors.length === 0) {
        setProblem(
          "No wallet extension detected. Install Binance Wallet or MetaMask, then reload.",
        );
        return;
      }
      if (connectors.length === 1) {
        connect({ connector: connectors[0] });
        return;
      }
      setShowWallets(true);
      return;
    }
    if (blocker === "network") {
      void switchToTestnet();
      return;
    }
    if (blocker !== "none" || pending) return;

    resetWrite();
    try {
      // Re-read the quote at click time: the contract rejects any mismatch, so a stale
      // quote from render time would burn a signature.
      const value = await readContract(config, {
        address: gardenAddress,
        abi: agentMintGardenAbi,
        functionName: "quoteMintPrice",
        args: [BigInt(quantity)],
      });
      await writeContractAsync({
        address: gardenAddress,
        abi: agentMintGardenAbi,
        functionName: "mint",
        args: [BigInt(quantity)],
        value,
      });
    } catch (error) {
      setProblem(decodeMintError(error));
    }
  }

  const errorText = problem ?? (writeError ? decodeMintError(writeError) : null);
  const nextTokenId = supply < policy.maxSupply ? supply + 1n : null;

  return (
    <section className="mint-card" id="mint">
      <div className="mint-form">
        <p className="eyebrow">Mint</p>
        <h2 className="mint-title">Take one or two plots</h2>
        <p className="mint-lede">
          Price and supply are read from the contract each time this page loads. You sign the
          exact amount the contract asks for — it refuses anything else.
        </p>

        <div className="field">
          <div className="field-head">
            <span className="field-label">Quantity</span>
            <span className="field-note">
              {spendable.toString()} available to this wallet
            </span>
          </div>
          <div className="stepper">
            <button
              aria-label="Decrease quantity"
              disabled={quantity <= 1 || pending}
              onClick={() => setRequestedQuantity(quantity - 1)}
              type="button"
            >
              −
            </button>
            <span className="step-value">{quantity}</span>
            <button
              aria-label="Increase quantity"
              disabled={quantity >= upperBound || pending}
              onClick={() => setRequestedQuantity(quantity + 1)}
              type="button"
            >
              +
            </button>
          </div>
        </div>

        <dl className="quote">
          <div className="quote-row">
            <dt>Free in this mint</dt>
            <dd>{freePart.toString()}</dd>
          </div>
          <div className="quote-row">
            <dt>Paid at {formatTbnb(price)} tBNB</dt>
            <dd>{paidPart.toString()}</dd>
          </div>
          <div className="quote-row quote-total">
            <dt>You pay</dt>
            <dd>{formatTbnb(quote)} tBNB</dd>
          </div>
        </dl>

        <button
          className="cta"
          disabled={pending || !actionable}
          onClick={handleClick}
          type="button"
        >
          {label}
        </button>
        {showWallets && blocker === "connect" && connectors.length > 0 && (
          <ul className="connector-list connector-list-inline">
            {connectors.map((connector, index) => (
              <li key={`${connector.id}-${index}`}>
                <button
                  onClick={() => {
                    setShowWallets(false);
                    connect({ connector });
                  }}
                  type="button"
                >
                  {connector.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">
          {pending
            ? "Keep this tab open while the transaction confirms."
            : blocker === "none"
              ? "Your wallet will show the same amount before you sign."
              : copy.detail}
        </p>

        <div aria-live="polite" className="mint-status">
          {errorText && <p className="status status-error">{errorText}</p>}
          {!errorText && connectError && (
            <p className="status status-error">{friendlyConnectError(connectError)}</p>
          )}
          {reverted && !errorText && (
            <p className="status status-error">
              The transaction was mined but reverted. Nothing was minted and you only spent gas.
            </p>
          )}
          {hash && !succeeded && !reverted && (
            <p className="status status-info">
              Transaction sent.{" "}
              <a href={transactionExplorerUrl(hash)} rel="noreferrer" target="_blank">
                Track it on BscScan ↗
              </a>
            </p>
          )}
          {succeeded && (
            <p className="status status-success">
              Minted.{" "}
              <a href={transactionExplorerUrl(hash!)} rel="noreferrer" target="_blank">
                View the transaction ↗
              </a>
            </p>
          )}
        </div>
      </div>

      <aside className="mint-aside">
        <ArtPreview
          caption={nextTokenId ? `Next up · GARDEN #${nextTokenId.toString()}` : "Garden full"}
          note="previewed with the same rule the contract paints with"
          tokenId={nextTokenId}
        />

        {succeeded && mintedIds.length > 0 && (
          <div className="minted-list">
            <p className="minted-heading">Your new token{mintedIds.length > 1 ? "s" : ""}</p>
            {mintedIds.map((tokenId) => (
              <MintedToken key={tokenId.toString()} tokenId={tokenId} />
            ))}
          </div>
        )}
      </aside>
    </section>
  );
}
