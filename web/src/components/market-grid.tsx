"use client";

import { useEffect, useState } from "react";
import { bscTestnet } from "wagmi/chains";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { transactionExplorerUrl, tokenExplorerUrl } from "@/lib/contracts";
import { shortAddress } from "@/lib/format";
import { bnbUsdRate, marketAbi, marketAddress } from "@/lib/market-contracts";
import { decodeMarketError, describePrice } from "@/lib/market";
import { formatTbnb } from "@/lib/mint";
import { useMarket } from "@/lib/use-market";
import { useWalletChain } from "@/lib/use-wallet-chain";

export function MarketGrid() {
  const { status, error, items, staleCount, refresh } = useMarket();
  const { address, isConnected } = useAccount();
  const { chainId } = useWalletChain();
  const [problem, setProblem] = useState<string | null>(null);
  const [buying, setBuying] = useState<number | null>(null);

  const { writeContractAsync, data: hash, isPending, reset } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    // Only re-read the book; the button state follows from `isPending` on its own.
    if (receipt.isSuccess) refresh();
  }, [receipt.isSuccess, refresh]);

  async function handleBuy(tokenId: number, price: bigint) {
    setProblem(null);
    if (!isConnected) {
      setProblem("Connect a wallet first — the token is transferred to the buyer.");
      return;
    }
    if (chainId !== bscTestnet.id) {
      setProblem("Switch the wallet to BSC Testnet before buying.");
      return;
    }
    reset();
    setBuying(tokenId);
    try {
      await writeContractAsync({
        address: marketAddress,
        abi: marketAbi,
        functionName: "buy",
        args: [BigInt(tokenId)],
        value: price,
      });
    } catch (writeError) {
      setProblem(decodeMarketError(writeError));
      setBuying(null);
    }
  }

  return (
    <section className="market" aria-label="Listings">
      <div className="gallery-toolbar">
        <p className="gallery-count">
          {status === "loading"
            ? "reading the order book…"
            : `${items.length} listing${items.length === 1 ? "" : "s"}`}
          {staleCount > 0 && ` · ${staleCount} stale hidden`}
        </p>
        <button className="button button-ghost gallery-refresh" onClick={refresh} type="button">
          Refresh
        </button>
      </div>

      {status === "error" && (
        <p className="status status-error">
          {error ?? "Could not read the market."} Public endpoints rate-limit log queries; try
          again in a moment.
        </p>
      )}

      {receipt.isSuccess && hash && (
        <p className="status status-success">
          Bought.{" "}
          <a href={transactionExplorerUrl(hash)} rel="noreferrer" target="_blank">
            View the transaction ↗
          </a>
        </p>
      )}

      {problem && <p className="status status-error">{problem}</p>}

      {status !== "error" && items.length === 0 && status !== "loading" && (
        <div className="gallery-empty">
          <p className="gallery-empty-title">No gardens for sale</p>
          <p>
            Nothing is listed right now. Open <a className="me-link" href="/me">My garden</a> and
            list one of yours.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="gallery-grid">
          {items.map((item) => {
            const price = describePrice(item.price, bnbUsdRate);
            const mine = address && item.seller.toLowerCase() === address.toLowerCase();
            const working = isPending && buying === item.tokenId;
            return (
              <article className="market-card" key={item.tokenId}>
                <a
                  className="gallery-art"
                  href={tokenExplorerUrl(BigInt(item.tokenId))}
                  rel="noreferrer"
                  target="_blank"
                >
                  {item.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img alt={item.name} loading="lazy" src={item.image} />
                  ) : (
                    <span className="gallery-art-missing">art unavailable</span>
                  )}
                </a>

                <div className="gallery-meta">
                  <p className="gallery-title">{item.name}</p>
                  <p className="market-price">
                    {price.tbnb} tBNB <span className="sell-usd">≈ {price.usd}</span>
                  </p>
                  <p className="gallery-mint">
                    seller {shortAddress(item.seller)}
                    {mine && " (you)"}
                  </p>
                  <button
                    className="market-buy"
                    disabled={working || mine}
                    onClick={() => handleBuy(item.tokenId, item.price)}
                    type="button"
                  >
                    {mine
                      ? "Your listing"
                      : working
                        ? "Confirm in your wallet…"
                        : `Buy for ${formatTbnb(item.price)} tBNB`}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
