"use client";

import { useCallback } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { agentMintGardenAbi, gardenAddress } from "./contracts";
import { fallbackPolicy, type GardenPolicy } from "./mint";

const REFRESH_MS = 15_000;

/**
 * Owns every contract read the page needs, so components never duplicate an RPC call and
 * `refetch` after a mint updates the whole page from one place.
 */
export function useGarden() {
  const { address } = useAccount();

  const supplyRead = useReadContract({
    address: gardenAddress,
    abi: agentMintGardenAbi,
    functionName: "totalSupply",
    query: { refetchInterval: REFRESH_MS },
  });

  const priceRead = useReadContract({
    address: gardenAddress,
    abi: agentMintGardenAbi,
    functionName: "mintPrice",
  });

  const maxSupplyRead = useReadContract({
    address: gardenAddress,
    abi: agentMintGardenAbi,
    functionName: "MAX_SUPPLY",
  });

  const freeSupplyRead = useReadContract({
    address: gardenAddress,
    abi: agentMintGardenAbi,
    functionName: "FREE_SUPPLY",
  });

  const maxPerWalletRead = useReadContract({
    address: gardenAddress,
    abi: agentMintGardenAbi,
    functionName: "MAX_PER_WALLET",
  });

  const pausedRead = useReadContract({
    address: gardenAddress,
    abi: agentMintGardenAbi,
    functionName: "paused",
    query: { refetchInterval: REFRESH_MS },
  });

  const mintedByRead = useReadContract({
    address: gardenAddress,
    abi: agentMintGardenAbi,
    functionName: "mintedBy",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: REFRESH_MS },
  });

  const balanceRead = useBalance({
    address,
    query: { enabled: Boolean(address), refetchInterval: REFRESH_MS },
  });

  const policy: GardenPolicy = {
    maxSupply: maxSupplyRead.data ?? fallbackPolicy.maxSupply,
    freeSupply: freeSupplyRead.data ?? fallbackPolicy.freeSupply,
    maxPerWallet: maxPerWalletRead.data ?? fallbackPolicy.maxPerWallet,
  };

  const refetchAll = useCallback(() => {
    void supplyRead.refetch();
    void pausedRead.refetch();
    void mintedByRead.refetch();
    void balanceRead.refetch();
  }, [supplyRead, pausedRead, mintedByRead, balanceRead]);

  return {
    supply: supplyRead.data ?? 0n,
    price: priceRead.data ?? 0n,
    policy,
    paused: pausedRead.data ?? false,
    mintedBy: mintedByRead.data ?? 0n,
    balance: balanceRead.data?.value,
    /** True only before the first successful read, so the UI can avoid a flash of zeros. */
    isLoading: supplyRead.isLoading || priceRead.isLoading,
    refetchAll,
  };
}
