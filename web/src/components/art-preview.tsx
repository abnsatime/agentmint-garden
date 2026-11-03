"use client";

import { useMemo } from "react";
import { previewSvg, svgDataUri } from "@/lib/mint";

interface ArtPreviewProps {
  tokenId: bigint | null;
  caption: string;
  note?: string;
}

/**
 * Shows the artwork of a token that does not exist yet. Safe to do because the contract
 * derives the art purely from the token id, so this preview is what the mint will produce.
 */
export function ArtPreview({ tokenId, caption, note }: ArtPreviewProps) {
  const src = useMemo(
    () => (tokenId === null ? null : svgDataUri(previewSvg(tokenId))),
    [tokenId],
  );

  if (src === null) {
    return (
      <figure className="art art-empty">
        <div className="art-frame">
          <p>Every plot is taken.</p>
        </div>
        <figcaption>{caption}</figcaption>
      </figure>
    );
  }

  return (
    <figure className="art">
      <div className="art-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={`Artwork preview for GARDEN #${tokenId?.toString()}`} src={src} />
      </div>
      <figcaption>
        <span>{caption}</span>
        {note && <span className="art-note">{note}</span>}
      </figcaption>
    </figure>
  );
}
