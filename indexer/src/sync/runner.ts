import type { ChainReader } from "../chain/reader.js";
import type { Database } from "../db/client.js";
import type { Config } from "../env.js";
import { listCursors, readCursor } from "./cursor.js";
import { logBlockNumber } from "./events.js";
import { nextWindow, resumeBlock } from "./ranges.js";
import { countPending } from "./rows.js";
import { buildSyncStatus, type SyncStatus } from "./status.js";
import { streamsFor, type StreamSpec } from "./streams.js";
import { syncTokenMetadata, type MetadataReport } from "./metadata.js";
import { resolveTimestamps, timestampLookup } from "./timestamps.js";
import { commitWindow } from "./writer.js";

export interface StreamReport {
  stream: string;
  fromBlock: bigint;
  toBlock: bigint;
  windows: number;
  inserted: number;
  /** True when the run stopped at the window cap and there is more to scan. */
  more: boolean;
}

export interface MetadataReportSummary extends MetadataReport {}

export interface SyncReport {
  headBlock: bigint;
  streams: StreamReport[];
  metadata: MetadataReport;
  durationMs: number;
}

export interface RunnerOptions {
  db: Database;
  reader: ChainReader;
  config: Config;
  streams?: StreamSpec[];
  /** Bounds one run so a cold start cannot scan the whole chain in a single pass. */
  maxWindowsPerStream?: number;
  /** How many missing token URIs to read per run. */
  maxMetadataPerRun?: number;
  onProgress?: (message: string) => void;
}

const MAX_CACHED_TIMESTAMPS = 5_000;

function messageOf(error: unknown): string {
  return ((error as Error)?.message ?? "unknown error").split("\n")[0] ?? "unknown error";
}

/**
 * One pass over both streams, block-window by block-window.
 *
 * A window is read, decoded, and committed together with the cursor; if any step throws, the
 * cursor stays put and the next run re-reads the same window, which the unique keys make
 * harmless.
 */
export class SyncRunner {
  private readonly db: Database;
  private readonly reader: ChainReader;
  private readonly chainId: number;
  private readonly streams: StreamSpec[];
  private readonly logWindow: bigint;
  private readonly maxWindowsPerStream: number;
  private readonly maxMetadataPerRun: number;
  private readonly gardenAddress: `0x${string}`;
  private readonly onProgress?: (message: string) => void;
  private readonly timestamps = new Map<bigint, Date>();

  private running = false;
  private headBlock: bigint | null = null;
  private lastRunAt: Date | null = null;
  private lastError: string | null = null;

  constructor(options: RunnerOptions) {
    this.db = options.db;
    this.reader = options.reader;
    this.chainId = options.config.chainId;
    this.streams = options.streams ?? streamsFor(options.config);
    this.logWindow = options.config.logWindowBlocks;
    this.maxWindowsPerStream = options.maxWindowsPerStream ?? 200;
    this.maxMetadataPerRun = options.maxMetadataPerRun ?? 50;
    this.gardenAddress = options.config.garden.address;
    this.onProgress = options.onProgress;
  }

  async advanceOnce(): Promise<SyncReport> {
    if (this.running) throw new Error("a sync run is already in progress");

    this.running = true;
    const started = Date.now();

    try {
      const head = await this.reader.head();
      this.headBlock = head;
      const report: SyncReport = {
        headBlock: head,
        streams: [],
        metadata: { attempted: 0, stored: 0, failed: 0 },
        durationMs: 0,
      };

      for (const spec of this.streams) {
        report.streams.push(await this.syncStream(spec, head));
      }

      // Artwork is filled after the events, so a fresh mint is listed before it is pretty.
      report.metadata = await syncTokenMetadata(
        { db: this.db, reader: this.reader, gardenAddress: this.gardenAddress },
        this.maxMetadataPerRun,
      );

      this.lastRunAt = new Date();
      this.lastError = null;
      report.durationMs = Date.now() - started;
      return report;
    } catch (error) {
      this.lastError = messageOf(error);
      throw error;
    } finally {
      this.running = false;
    }
  }

  async status(): Promise<SyncStatus> {
    const cursors = await listCursors(this.db, this.chainId);
    return buildSyncStatus({
      running: this.running,
      headBlock: this.headBlock,
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      cursors,
      streams: this.streams.map((spec) => spec.name),
    });
  }

  private async syncStream(spec: StreamSpec, head: bigint): Promise<StreamReport> {
    const cursor = await readCursor(this.db, { chainId: this.chainId, stream: spec.name });
    const fromBlock = resumeBlock(cursor, spec.deployBlock);

    let from = fromBlock;
    let windows = 0;
    let inserted = 0;
    let more = false;

    for (;;) {
      const window = nextWindow(from, head, this.logWindow);
      if (!window) break;

      if (windows >= this.maxWindowsPerStream) {
        more = true;
        break;
      }

      const logs = await this.reader.logs({
        address: spec.address,
        topics: spec.topics,
        fromBlock: window.fromBlock,
        toBlock: window.toBlock,
      });

      await resolveTimestamps(
        logs.map((log) => logBlockNumber(log)),
        (block) => this.reader.timestamp(block),
        this.timestamps,
      );

      const events = spec.collect(logs, timestampLookup(this.timestamps));
      const committed = await commitWindow(this.db, {
        chainId: this.chainId,
        stream: spec.name,
        lastBlock: window.toBlock,
        events,
      });

      inserted += committed.inserted.mints + committed.inserted.transfers + committed.inserted.market;
      windows += 1;
      from = window.toBlock + 1n;

      this.onProgress?.(
        `${spec.name}: ${window.fromBlock}-${window.toBlock} ` +
          `(${logs.length} logs, ${countPending(events)} rows)`,
      );

      if (this.timestamps.size > MAX_CACHED_TIMESTAMPS) this.timestamps.clear();
    }

    return {
      stream: spec.name,
      fromBlock,
      toBlock: from - 1n >= fromBlock ? from - 1n : fromBlock,
      windows,
      inserted,
      more,
    };
  }
}
