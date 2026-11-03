"use client";

import { relativeTime } from "@/lib/gallery";
import { shortAddress } from "@/lib/format";
import { tokenExplorerUrl, transactionExplorerUrl } from "@/lib/contracts";
import { useGallery } from "@/lib/use-gallery";

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function GalleryGrid() {
  const { status, error, supply, page, items, mints, mintsStatus, hasNext, nextPage, previousPage, refresh } =
    useGallery(24);

  const now = nowSeconds();

  return (
    <section className="gallery" aria-label="Minted gardens">
      <div className="gallery-toolbar">
        <p className="gallery-count">
          {supply === null ? "reading the chain…" : `${supply} of 2,000 minted`}
        </p>
        <button className="button button-ghost gallery-refresh" onClick={refresh} type="button">
          Refresh
        </button>
      </div>

      {status === "error" && (
        <p className="status status-error">
          {error ?? "The gallery could not be loaded."} Public endpoints rate-limit reads; try
          again in a moment.
        </p>
      )}

      {status === "loading" && items.length === 0 && (
        <div className="gallery-grid" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="gallery-card gallery-skeleton" key={index} />
          ))}
        </div>
      )}

      {status !== "error" && supply === 0 && (
        <div className="gallery-empty">
          <p className="gallery-empty-title">No gardens yet</p>
          <p>The first mint will appear here. Every plot is drawn by the contract itself.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="gallery-grid">
          {items.map((item) => {
            const mint = mints[item.tokenId];
            return (
              <article className="gallery-card" key={item.tokenId}>
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
                  <p className="gallery-title">
                    {item.name}
                    {item.hue && <span className="gallery-hue">hue {item.hue}</span>}
                  </p>
                  <p className="gallery-owner">
                    held by{" "}
                    <a
                      href={`https://testnet.bscscan.com/address/${item.owner}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {shortAddress(item.owner)}
                    </a>
                  </p>
                  {mint ? (
                    <p className="gallery-mint">
                      {mint.freeMint ? "free mint" : `paid ${Number(mint.pricePaid) / 1e18} tBNB`} ·{" "}
                      {mint.timestamp ? relativeTime(mint.timestamp, now) : "recently"} ·{" "}
                      <a href={transactionExplorerUrl(mint.transactionHash)} rel="noreferrer" target="_blank">
                        {shortAddress(mint.minter)}
                      </a>
                    </p>
                  ) : (
                    <p className="gallery-mint gallery-mint-muted">
                      {mintsStatus === "loading" ? "reading mint history…" : "mint details unavailable"}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {(page > 1 || hasNext) && (
        <div className="gallery-pager">
          <button
            className="button button-ghost"
            disabled={page <= 1}
            onClick={previousPage}
            type="button"
          >
            ← Newer
          </button>
          <span className="gallery-page-number">page {page}</span>
          <button
            className="button button-ghost"
            disabled={!hasNext}
            onClick={nextPage}
            type="button"
          >
            Older →
          </button>
        </div>
      )}
    </section>
  );
}
