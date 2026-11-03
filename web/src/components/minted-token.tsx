"use client";

import { useReadContract } from "wagmi";
import { agentMintGardenAbi, gardenAddress, tokenExplorerUrl } from "@/lib/contracts";
import { decodeTokenUri } from "@/lib/mint";

/** Renders a token that already exists, straight from the on-chain token URI. */
export function MintedToken({ tokenId }: { tokenId: bigint }) {
  const { data: uri, isLoading } = useReadContract({
    address: gardenAddress,
    abi: agentMintGardenAbi,
    functionName: "tokenURI",
    args: [tokenId],
  });

  const metadata = decodeTokenUri(uri);
  const name = metadata?.name ?? `GARDEN #${tokenId.toString()}`;

  return (
    <figure className="minted-token">
      <div className="minted-token-frame">
        {metadata?.image ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img alt={name} src={metadata.image} />
        ) : (
          <div className="minted-token-pending" aria-hidden="true">
            {isLoading ? "reading metadata…" : "metadata unavailable"}
          </div>
        )}
      </div>
      <figcaption>
        <a href={tokenExplorerUrl(tokenId)} rel="noreferrer" target="_blank">
          {name}
        </a>
        {metadata?.attributes?.map((attribute) => (
          <span className="trait" key={attribute.trait_type}>
            {attribute.trait_type} · {attribute.value}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
