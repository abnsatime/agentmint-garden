/**
 * Block timestamps, cached for the life of a sync run.
 *
 * Logs carry a block number but no time, so every row needs a lookup. Only the blocks that
 * actually produced a log are fetched, and each one is fetched once even when several logs share
 * it, which keeps a window at a handful of `eth_getBlockByNumber` calls.
 */

export type TimestampFetcher = (blockNumber: bigint) => Promise<bigint>;

export function blocksNeedingTimestamps(
  blocks: Iterable<bigint>,
  cache: ReadonlyMap<bigint, Date>,
): bigint[] {
  const missing = new Set<bigint>();
  for (const block of blocks) {
    if (!cache.has(block)) missing.add(block);
  }
  return [...missing].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index] as T;
      results[index] = await work(item);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Fills the cache for every block that is not in it yet. */
export async function resolveTimestamps(
  blocks: Iterable<bigint>,
  fetch: TimestampFetcher,
  cache: Map<bigint, Date>,
  concurrency = 4,
): Promise<void> {
  const missing = blocksNeedingTimestamps(blocks, cache);
  if (missing.length === 0) return;

  await mapLimit(missing, concurrency, async (block) => {
    const seconds = await fetch(block);
    cache.set(block, new Date(Number(seconds) * 1000));
  });
}

export type TimestampLookup = (blockNumber: bigint) => Date;

/**
 * Turns the cache into the synchronous lookup the row builders use. A miss is a bug — the
 * window would be written with a wrong time — so it throws and the batch is retried.
 */
export function timestampLookup(cache: ReadonlyMap<bigint, Date>): TimestampLookup {
  return (blockNumber) => {
    const value = cache.get(blockNumber);
    if (!value) throw new Error(`no timestamp cached for block ${blockNumber}`);
    return value;
  };
}
