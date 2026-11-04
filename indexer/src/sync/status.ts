import type { Cursor } from "./cursor.js";

/**
 * Status is JSON-shaped: block numbers travel as decimal strings so the payload cannot break on
 * a BigInt.
 */

export interface SyncStatusStream {
  stream: string;
  lastBlock: string;
  /** Null when this process has not read the head yet, so the lag is genuinely unknown. */
  lagBlocks: string | null;
  started: boolean;
  updatedAt: string | null;
}

export interface SyncStatus {
  running: boolean;
  headBlock: string | null;
  lagBlocks: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  streams: SyncStatusStream[];
}

export function lagBlocks(head: bigint | null, lastBlock: bigint): bigint {
  if (head === null) return 0n;
  return head > lastBlock ? head - lastBlock : 0n;
}

export interface BuildStatusInput {
  running: boolean;
  headBlock: bigint | null;
  lastRunAt: Date | null;
  lastError: string | null;
  cursors: Cursor[];
  /** Every configured stream, so one without a cursor still shows up as not started. */
  streams: string[];
}

export function buildSyncStatus(input: BuildStatusInput): SyncStatus {
  const byStream = new Map(input.cursors.map((cursor) => [cursor.stream, cursor]));

  const streams = [...new Set([...input.streams, ...input.cursors.map((c) => c.stream)])]
    .sort((left, right) => left.localeCompare(right))
    .map((stream) => {
      const cursor = byStream.get(stream);
      if (!cursor) {
        return {
          stream,
          lastBlock: "0",
          lagBlocks: input.headBlock === null ? null : input.headBlock.toString(),
          started: false,
          updatedAt: null,
        };
      }
      return {
        stream,
        lastBlock: cursor.lastBlock.toString(),
        lagBlocks:
          input.headBlock === null ? null : lagBlocks(input.headBlock, cursor.lastBlock).toString(),
        started: true,
        updatedAt: cursor.updatedAt.toISOString(),
      };
    });

  // The overall figure is the slowest stream's lag: a stream that is 50 blocks behind is the
  // one that matters, even when its neighbour is up to date.
  const slowest = input.cursors.reduce<bigint | null>((worst, cursor) => {
    const lag = lagBlocks(input.headBlock, cursor.lastBlock);
    return worst === null || lag > worst ? lag : worst;
  }, null);

  return {
    running: input.running,
    headBlock: input.headBlock === null ? null : input.headBlock.toString(),
    lagBlocks: input.headBlock === null ? null : (slowest ?? 0n).toString(),
    lastRunAt: input.lastRunAt === null ? null : input.lastRunAt.toISOString(),
    lastError: input.lastError,
    streams,
  };
}
