"use client";

import { useAccount } from "wagmi";
import { useGarden } from "@/lib/use-garden";
import { formatTbnb, freeSupplyRemaining, remainingSupply } from "@/lib/mint";

function percent(part: bigint, whole: bigint) {
  if (whole === 0n) return 0;
  return Math.min(100, Number((part * 10_000n) / whole) / 100);
}

export function GardenStats() {
  const { supply, price, policy, mintedBy, isLoading } = useGarden();
  const { isConnected } = useAccount();

  const freeLeft = freeSupplyRemaining(supply, policy.freeSupply);
  const supplyLeft = remainingSupply(supply, policy.maxSupply);
  const freeWidth = percent(supply < policy.freeSupply ? supply : policy.freeSupply, policy.maxSupply);
  const paidWidth = percent(supply > policy.freeSupply ? supply - policy.freeSupply : 0n, policy.maxSupply);

  return (
    <section className="stats" aria-label="Collection status">
      <div className="stats-grid">
        <article className="stat">
          <p className="stat-label">Minted</p>
          <p className="stat-value">
            {supply.toString()}
            <span className="stat-total"> / {policy.maxSupply.toString()}</span>
          </p>
          <p className="stat-note">{isLoading ? "reading chain…" : `${supplyLeft.toString()} left`}</p>
        </article>

        <article className="stat">
          <p className="stat-label">Free phase</p>
          <p className="stat-value">
            {freeLeft.toString()}
            <span className="stat-total"> / {policy.freeSupply.toString()}</span>
          </p>
          <p className="stat-note">{freeLeft > 0n ? "still free to claim" : "free phase closed"}</p>
        </article>

        <article className="stat">
          <p className="stat-label">Price now</p>
          <p className="stat-value">{freeLeft > 0n ? "Free" : `${formatTbnb(price)} tBNB`}</p>
          <p className="stat-note">
            {freeLeft > 0n ? `then ${formatTbnb(price)} tBNB each` : "after token 1,000"}
          </p>
        </article>

        <article className="stat">
          <p className="stat-label">Your mints</p>
          <p className="stat-value">
            {isConnected ? mintedBy.toString() : "—"}
            <span className="stat-total"> / {policy.maxPerWallet.toString()}</span>
          </p>
          <p className="stat-note">
            {isConnected
              ? mintedBy >= policy.maxPerWallet
                ? "wallet limit reached"
                : "per wallet"
              : "connect to check"}
          </p>
        </article>
      </div>

      <div className="progress" aria-hidden="true">
        <span className="progress-free" style={{ width: `${freeWidth}%` }} />
        <span className="progress-paid" style={{ width: `${paidWidth}%` }} />
      </div>
      <p className="progress-legend">
        <span className="legend-free">free 1–1,000</span>
        <span className="legend-paid">paid 1,001–2,000</span>
      </p>
    </section>
  );
}
