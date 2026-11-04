"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { bscTestnet } from "wagmi/chains";
import { useAccount, useConfig, useReadContract, useWriteContract } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { agentMintGardenAbi, gardenAddress } from "@/lib/contracts";
import { bnbUsdRate, marketAbi, marketAddress } from "@/lib/market-contracts";
import { decodeMarketError, formatUsd, suggestFloorPrice, tbnbToUsd } from "@/lib/market";
import { formatTbnb } from "@/lib/mint";
import { useWalletChain } from "@/lib/use-wallet-chain";

/**
 * Sell controls for one held token: approve the market if needed, then list it.
 *
 * Both transactions are awaited to their receipts before the button frees up again, so a
 * second click cannot queue a duplicate list or cancel while the first is still in flight.
 */
export function SellControls({ tokenId, onChanged }: { tokenId: number; onChanged?: () => void }) {
  const { address } = useAccount();
  const config = useConfig();
  const { chainId, isOnTestnet, switchToTestnet, busy: switching, error: switchError } =
    useWalletChain();

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

  const { writeContractAsync } = useWriteContract();

  const seller = listing.data?.[0] as `0x${string}` | undefined;
  const listedPrice = listing.data?.[1] as bigint | undefined;
  const listed = Boolean(seller) && seller !== "0x0000000000000000000000000000000000000000";
  const mine = listed && address && seller?.toLowerCase() === address.toLowerCase();

  const priceWei = (() => {
    try {
      return parseEther(price || "0");
    } catch {
      return 0n;
    }
  })();

  async function handleList() {
    if (!address || priceWei <= 0n || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const [approved, operator] = await Promise.all([
        readContract(config, {
          address: gardenAddress,
          abi: agentMintGardenAbi,
          functionName: "getApproved",
          args: [BigInt(tokenId)],
        }),
        readContract(config, {
          address: gardenAddress,
          abi: agentMintGardenAbi,
          functionName: "isApprovedForAll",
          args: [address, marketAddress],
        }),
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
      const listHash = await writeContractAsync({
        address: marketAddress,
        abi: marketAbi,
        functionName: "list",
        args: [BigInt(tokenId), priceWei],
      });

      setStep("Waiting for the block…");
      await waitForTransactionReceipt(config, { hash: listHash });
      await listing.refetch();
      onChanged?.();
      setStep(null);
    } catch (error) {
      setProblem(decodeMarketError(error));
      setStep(null);
    } finally {
      // Only here, after the receipt — a hash alone does not mean the listing exists.
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      setStep("Cancelling…");
      const cancelHash = await writeContractAsync({
        address: marketAddress,
        abi: marketAbi,
        functionName: "cancel",
        args: [BigInt(tokenId)],
      });
      setStep("Waiting for the block…");
      await waitForTransactionReceipt(config, { hash: cancelHash });
      await listing.refetch();
      onChanged?.();
      setStep(null);
    } catch (error) {
      setProblem(decodeMarketError(error));
      setStep(null);
    } finally {
      setBusy(false);
    }
  }

  if (!isOnTestnet) {
    return (
      <div className="sell">
        <p className="sell-line muted">
          Switch the wallet to BSC Testnet before listing — the market only exists on chain{" "}
          {bscTestnet.id}.
        </p>
        <button
          className="sell-button"
          disabled={switching}
          onClick={() => void switchToTestnet()}
          type="button"
        >
          {switching
            ? "Switching…"
            : `Switch to BSC Testnet${chainId ? ` (on ${chainId})` : ""}`}
        </button>
        {switchError && <p className="sell-error">{switchError}</p>}
      </div>
    );
  }

  if (mine) {
    return (
      <div className="sell">
        <p className="sell-line">
          listed at {formatTbnb(listedPrice ?? 0n)} tBNB{" "}
          <span className="sell-usd">≈ {formatUsd(tbnbToUsd(listedPrice ?? 0n, bnbUsdRate))}</span>
        </p>
        <button className="sell-button ghost" disabled={busy} onClick={handleCancel} type="button">
          {busy ? (step ?? "Working…") : "Cancel listing"}
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
        {busy ? (step ?? "Working…") : `List for ${formatTbnb(priceWei)} tBNB`}
      </button>
      {problem && <p className="sell-error">{problem}</p>}
    </div>
  );
}
