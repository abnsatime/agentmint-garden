"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { relativeTime } from "@/lib/gallery";
import { shortAddress } from "@/lib/format";
import { tokenExplorerUrl, transactionExplorerUrl } from "@/lib/contracts";
import { useMyGarden } from "@/lib/use-my-garden";
import { SellControls } from "./sell-controls";
import { WalletButton } from "./wallet-button";

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function MyGardenPanel() {
  const { isConnected, address } = useAccount();
  const { status, error, holdings, activity, mintsUsed, maxPerWallet, counts, refresh } = useMyGarden();
  const now = nowSeconds();

  if (!isConnected) {
    return (
      <section className="me-empty">
        <p className="me-empty-title">Connect a wallet to see your garden</p>
        <p className="me-empty-lede">
          Holdings, mint history and every transfer in or out are read from the chain for the
          connected wallet only. Nothing is stored anywhere.
        </p>
        <WalletButton />
      </section>
    );
  }

  return (
    <section className="me">
      <div className="me-toolbar">
        <p className="me-address">
          reading {address ? shortAddress(address, 6) : "wallet"}
          {status === "loading" && <span className="me-loading"> · scanning logs…</span>}
        </p>
        <button className="button button-ghost gallery-refresh" onClick={refresh} type="button">
          Refresh
        </button>
      </div>

      {status === "error" && (
        <p className="status status-error">
          {error ?? "Could not read your garden."} Public endpoints rate-limit log queries; try
          again in a moment.
        </p>
      )}

      <div className="me-summary">
        <article className="me-stat">
          <p className="stat-label">Holding</p>
          <p className="stat-value">{holdings.length}</p>
          <p className="stat-note">garden{holdings.length === 1 ? "" : "s"} right now</p>
        </article>
        <article className="me-stat">
          <p className="stat-label">Mints used</p>
          <p className="stat-value">
            {mintsUsed}
            <span className="stat-total"> / {maxPerWallet}</span>
          </p>
          <p className="stat-note">{counts.mints} mint event{counts.mints === 1 ? "" : "s"}</p>
        </article>
        <article className="me-stat">
          <p className="stat-label">Received</p>
          <p className="stat-value">{counts.inbound}</p>
          <p className="stat-note">transfers in</p>
        </article>
        <article className="me-stat">
          <p className="stat-label">Sent</p>
          <p className="stat-value">{counts.outbound}</p>
          <p className="stat-note">transfers out</p>
        </article>
      </div>

      <h2 className="me-heading">Your gardens</h2>

      {status === "loading" && holdings.length === 0 && (
        <div className="holding-grid" aria-hidden="true">
          {Array.from({ length: 2 }, (_, index) => (
            <div className="holding-card holding-skeleton" key={index} />
          ))}
        </div>
      )}

      {status !== "loading" && holdings.length === 0 && (
        <div className="gallery-empty">
          <p className="gallery-empty-title">No gardens in this wallet</p>
          <p>
            Mint one, or receive one by transfer.{" "}
            <Link className="me-link" href="/mint">
              Go to mint →
            </Link>
          </p>
        </div>
      )}

      {holdings.length > 0 && (
        <div className="holding-grid">
          {holdings.map((holding) => (
            <article className="holding-card" key={holding.tokenId}>
              <a
                className="holding-art"
                href={tokenExplorerUrl(BigInt(holding.tokenId))}
                rel="noreferrer"
                target="_blank"
              >
                {holding.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img alt={holding.name} loading="lazy" src={holding.image} />
                ) : (
                  <span className="gallery-art-missing">art unavailable</span>
                )}
              </a>
              <div className="holding-body">
                <p className="holding-title">{holding.name}</p>

                <ul className="traits">
                  {holding.traits.map((trait) => (
                    <li className="trait-chip" key={trait.trait_type}>
                      <span>{trait.trait_type}</span>
                      {trait.value}
                    </li>
                  ))}
                </ul>

                <SellControls onChanged={() => refresh()} tokenId={holding.tokenId} />

                <p className="holding-note">
                  {holding.mintedHere ? "minted here" : `received from ${holding.from ? shortAddress(holding.from) : "another wallet"}`}
                  {holding.acquiredAt ? ` · ${relativeTime(holding.acquiredAt, now)}` : ""}
                  {" · "}
                  <a href={transactionExplorerUrl(holding.acquiredTx)} rel="noreferrer" target="_blank">
                    tx
                  </a>
                </p>
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 className="me-heading">Activity</h2>

      {activity.length === 0 ? (
        <p className="me-none">No movements recorded for this wallet yet.</p>
      ) : (
        <ol className="activity">
          {activity.map((item) => (
            <li className="activity-row" key={`${item.transactionHash}-${item.logIndex}`}>
              <span className={`activity-kind activity-${item.kind}`}>
                {item.kind === "mint" ? "mint" : item.kind === "in" ? "in" : "out"}
              </span>
              <span className="activity-text">
                {item.kind === "mint" && (
                  <>
                    minted #{item.tokenId}
                    {item.freeMint === true ? " · free" : ""}
                    {item.freeMint === false && item.pricePaid !== undefined
                      ? ` · paid ${Number(item.pricePaid) / 1e18} tBNB`
                      : ""}
                  </>
                )}
                {item.kind === "in" && (
                  <>
                    received #{item.tokenId} from{" "}
                    <a
                      href={`https://testnet.bscscan.com/address/${item.counterparty}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {item.counterparty ? shortAddress(item.counterparty) : "unknown"}
                    </a>
                  </>
                )}
                {item.kind === "out" && (
                  <>
                    sent #{item.tokenId} to{" "}
                    <a
                      href={`https://testnet.bscscan.com/address/${item.counterparty}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {item.counterparty ? shortAddress(item.counterparty) : "unknown"}
                    </a>
                  </>
                )}
              </span>
              <span className="activity-time">
                {item.timestamp ? relativeTime(item.timestamp, now) : "—"}
              </span>
              <a
                className="activity-tx"
                href={transactionExplorerUrl(item.transactionHash)}
                rel="noreferrer"
                target="_blank"
              >
                tx ↗
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
