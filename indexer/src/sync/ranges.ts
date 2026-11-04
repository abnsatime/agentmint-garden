/**
 * Block-range planning. Public RPC endpoints refuse a wide `eth_getLogs` span (publicnode caps
 * at 50k blocks), so a scan is always a sequence of bounded windows.
 */

export interface BlockWindow {
  fromBlock: bigint;
  toBlock: bigint;
}

export function planWindows(fromBlock: bigint, toBlock: bigint, size: bigint): BlockWindow[] {
  if (size <= 0n) throw new Error("window size must be positive");
  if (toBlock < fromBlock) return [];

  const windows: BlockWindow[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = cursor + size - 1n > toBlock ? toBlock : cursor + size - 1n;
    windows.push({ fromBlock: cursor, toBlock: end });
    cursor = end + 1n;
  }
  return windows;
}

/** The next window to scan, or null when the head has been reached. */
export function nextWindow(
  fromBlock: bigint,
  headBlock: bigint,
  size: bigint,
): BlockWindow | null {
  if (fromBlock > headBlock) return null;
  return planWindows(fromBlock, headBlock, size)[0] ?? null;
}

/**
 * Where a scan resumes: one past the cursor, or the deployment block when there is no cursor
 * yet. Never rewinds, so a stale cursor cannot rescan the chain.
 */
export function resumeBlock(
  cursor: { lastBlock: bigint } | null | undefined,
  deployBlock: bigint,
): bigint {
  if (!cursor) return deployBlock;
  const next = cursor.lastBlock + 1n;
  return next > deployBlock ? next : deployBlock;
}

/** True when `next` is a real advance; guards against a cursor moving backwards. */
export function shouldAdvance(current: bigint | null | undefined, next: bigint): boolean {
  if (next < 0n) return false;
  if (current === null || current === undefined) return true;
  return next > current;
}
