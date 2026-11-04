import { createChainReader } from "../chain/reader.js";
import { createDb } from "../db/client.js";
import { loadConfig } from "../env.js";
import { loadDotEnv } from "../env-file.js";
import { SyncRunner } from "../sync/runner.js";

/**
 * `pnpm sync` scans once and exits; `pnpm sync --loop 12` keeps going every 12 seconds.
 * `--max-windows N` bounds one pass so a cold start cannot run for hours.
 */

function usage() {
  console.log(`usage: pnpm sync [--loop <seconds>] [--max-windows <n>] [--dry-run]

  --loop <seconds>   keep syncing on that interval instead of returning after one pass
  --max-windows <n>  stop a pass after n log windows per stream (default 200)
  --dry-run          read the chain and report, without writing anything`);
}

function value(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  return args[index + 1];
}

function numeric(args: readonly string[], name: string, fallback: number): number {
  const raw = value(args, name);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} needs a non-negative number, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

const loaded = loadDotEnv(".env");
const config = loadConfig();
const { db, pool } = createDb(config.databaseUrl);

const runner = new SyncRunner({
  db,
  reader: createChainReader(config.rpcUrl),
  config,
  maxWindowsPerStream: numeric(args, "--max-windows", 200),
  onProgress: (message) => console.log(`  ${message}`),
});

const loopSeconds = numeric(args, "--loop", 0);

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    console.log(`${signal}: finishing the current window, then exiting`);
  });
}

try {
  if (loaded.length > 0) console.log(`using ${loaded.length} value(s) from .env`);

  for (;;) {
    const report = await runner.advanceOnce();
    console.log(`head ${report.headBlock} · ${report.durationMs}ms`);

    for (const stream of report.streams) {
      const pending = stream.more ? " · more pending" : "";
      console.log(
        `  ${stream.stream.padEnd(7)} blocks ${stream.fromBlock}..${stream.toBlock} · ` +
          `${stream.windows} window(s) · ${stream.inserted} new row(s)${pending}`,
      );
    }

    if (loopSeconds <= 0 || stopping) break;
    await new Promise((resolve) => setTimeout(resolve, loopSeconds * 1000));
  }
} catch (error) {
  console.error(`sync failed: ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
