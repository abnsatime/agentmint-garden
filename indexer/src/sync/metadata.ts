import { and, eq, sql } from "drizzle-orm";
import type { ChainReader } from "../chain/reader.js";
import type { Database } from "../db/client.js";
import { gardenMints, tokenMetadata } from "../db/schema.js";
import { decodeTokenUri } from "./token-uri.js";

/**
 * Artwork lives in `tokenURI`, on chain, one call per token. Reading it once here means the
 * browser never has to: the gallery, the holdings list and the order book all reuse it.
 */

export interface MetadataDeps {
  db: Database;
  reader: ChainReader;
  gardenAddress: `0x${string}`;
}

export interface MetadataReport {
  attempted: number;
  stored: number;
  failed: number;
}

/**
 * Fills metadata for minted tokens that do not have it yet, newest first so a fresh mint shows
 * up in the gallery before the backfill is complete.
 */
export async function syncTokenMetadata(
  deps: MetadataDeps,
  limit = 50,
): Promise<MetadataReport> {
  const pending = await deps.db
    .select({ tokenId: gardenMints.tokenId })
    .from(gardenMints)
    .leftJoin(tokenMetadata, eq(tokenMetadata.tokenId, gardenMints.tokenId))
    .where(sql`${tokenMetadata.tokenId} is null`)
    .orderBy(sql`${gardenMints.tokenId} desc`)
    .limit(limit);

  const report: MetadataReport = { attempted: pending.length, stored: 0, failed: 0 };

  for (const row of pending) {
    try {
      const uri = await deps.reader.tokenUri(deps.gardenAddress, row.tokenId);
      const metadata = decodeTokenUri(uri);
      if (!metadata) {
        report.failed += 1;
        continue;
      }

      await deps.db
        .insert(tokenMetadata)
        .values({
          tokenId: row.tokenId,
          name: metadata.name,
          image: metadata.image ?? null,
          traits: metadata.traits,
        })
        .onConflictDoUpdate({
          target: tokenMetadata.tokenId,
          set: {
            name: metadata.name,
            image: metadata.image ?? null,
            traits: metadata.traits,
            updatedAt: sql`now()`,
          },
        });

      report.stored += 1;
    } catch {
      // A token whose URI cannot be read stays pending and is retried on the next pass.
      report.failed += 1;
    }
  }

  return report;
}

/** Used by the API to know whether a token's artwork is available yet. */
export async function hasMetadata(db: Database, tokenId: bigint): Promise<boolean> {
  const rows = await db
    .select({ tokenId: tokenMetadata.tokenId })
    .from(tokenMetadata)
    .where(and(eq(tokenMetadata.tokenId, tokenId)))
    .limit(1);
  return rows.length > 0;
}
