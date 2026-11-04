"use client";

import { useEffect, useState } from "react";
import { useAccount, useConfig, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { parseEther } from "viem";
import { bnbUsdRate, marketAbi, marketAddress } from "@/lib/market-contracts";
import { agentMintGardenAbi, gardenAddress } from "@/lib/contracts";
import { decodeMarketError, describePrice, suggestFloorPrice, tbnbToUsd, formatUsd } from "@/lib/market";
import { formatTbnb } from "@/lib/mint";

/**
 * Sell controls for one held token: approve the market if needed, then list it. Both
 * transactions are sent from the same handler so the second one cannot race the first.
 */
export function SellControls({ tokenId, onChanged }: { tokenId: number; onChanged?: () => void }) {
  const { address } = useAccount();
  const config = useConfig();
  const [price, setPrice] = useState(() => formatTbnb(suggestFloorPrice(bnbUsdRate)));
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const listing = useReadContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: "listingOf",
    args: [BigInt(tokenId)],
  });

  const { writeContractAsync, data: hash } = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    // The parent re-reads its holdings; the local step label clears when the next action starts.
    if (receipt.isSuccess) onChanged?.();
  }, [receipt.isSuccess, onChanged]);

  const seller = listing.data?.[0] as `0x${string}` | undefined;
  const listedPrice = listing.data?.[1] as bigint | undefined;
  const listed = seller && seller !== "0x0000000000000000000000000000000000000000";
  const mine = listed && address && seller.toLowerCase() === address.toLowerCase();

  const priceWei = (() => {
    try {
      return parseEther(price || "0");
    } catch {
      return 0n;
    }
  })();

  async function handleList() {
    if (!address || priceWei <= 0n) return;
    setBusy(true);
    setProblem(null);
    try {
      const [approved, operator] = await Promise.all([
        readContractApproved(config, tokenId),
        readContractOperator(config, address),
      ]);

      if (!approved && !operator) {
        setStep("Approving the market…");
        const approveHash = await writeContractAsync({
          address: gardenAddress,
          abi: agentMintGardenAbi,
          functionName: "approve",
          args: [marketAddress, BigInt(tokenId)],
        });
        await waitForTransactionReceipt(config, { hash: approveHash });
      }

      setStep("Listing…");
      await writeContractAsync({
        address: marketAddress,
        abi: marketAbi,
        functionName: "list",
        args: [BigInt(tokenId), priceWei],
      });
      setStep("Waiting for the block…");
    } catch (error) {
      setProblem(decodeMarketError(error));
      setStep(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setBusy(true);
    setProblem(null);
    try {
      setStep("Cancelling…");
      await writeContractAsync({
        address: marketAddress,
        abi: marketAbi,
        functionName: "cancel",
        args: [BigInt(tokenId)],
      });
    } catch (error) {
      setProblem(decodeMarketError(error));
    } finally {
      setStep(null);
      setBusy(false);
    }
  }

  if (mine) {
    return (
      <div className="sell">
        <p className="sell-line">
          listed at {formatTbnb(listedPrice ?? 0n)} tBNB{" "}
          <span className="sell-usd">≈ {formatUsd(tbnbToUsd(listedPrice ?? 0n, bnbUsdRate))}</span>
        </p>
        <button className="sell-button ghost" disabled={busy} onClick={handleCancel} type="button">
          {busy ? step ?? "Working…" : "Cancel listing"}
        </button>
        {problem && <p className="sell-error">{problem}</p>}
      </div>
    );
  }

  if (listed) {
    return (
      <p className="sell-line muted">
        listed by another wallet at {formatTbnb(listedPrice ?? 0n)} tBNB
      </p>
    );
  }

  return (
    <div className="sell">
      <label className="sell-field">
        <span>Ask</span>
        <input
          inputMode="decimal"
          onChange={(event) => setPrice(event.target.value)}
          value={price}
        />
        <span className="sell-unit">tBNB</span>
      </label>
      <p className="sell-usd">≈ {formatUsd(tbnbToUsd(priceWei, bnbUsdRate))}</p>
      <button
        className="sell-button"
        disabled={busy || priceWei <= 0n}
        onClick={handleList}
        type="button"
      >
        {busy ? step ?? "Working…" : `List for ${describePrice(priceWei, bnbUsdRate).tbnb} tBNB`}
      </button>
      {problem && <p className="sell-error">{problem}</p>}
    </div>
  );
}

async function readContractApproved(
  config: ReturnType<typeof useConfig>,
  tokenId: number,
): Promise<boolean> {
  const { readContract } = await import("wagmi/actions");
  const approved = await readContract(config, {
    address: gardenAddress,
    abi: agentMintGardenAbi,
    functionName: "getApproved",
    args: [BigInt(tokenId)],
  });
  return String(approved).toLowerCase() === marketAddress.toLowerCase();
}

async function readContractOperator(
  config: ReturnType<typeof useConfig>,
  owner: `0x${string}`,
): Promise<boolean> {
  const { readContract } = await import("wagmi/actions");
  return readContract(config, {
    address: gardenAddress,
    abi: agentMintGardenAbi,
    functionName: "isApprovedForAll",
    args: [owner, marketAddress],
  });
}
