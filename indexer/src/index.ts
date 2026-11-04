import { createChainReader } from "./chain/reader.js";
import { createDb } from "./db/client.js";
import { loadConfig } from "./env.js";
import { loadDotEnv } from "./env-file.js";
import { buildServer } from "./server/app.js";
import { collectHealth } from "./server/health.js";
import { SyncRunner } from "./sync/runner.js";

// A .env fills whatever the environment did not provide; explicit variables win.
const fromFile = loadDotEnv(".env");

const startedAt = Date.now();
const config = loadConfig();
const { db, pool } = createDb(config.databaseUrl);

const runner = new SyncRunner({
  db,
  reader: createChainReader(config.rpcUrl),
  config,
});

const app = buildServer({
  health: () => collectHealth(db, config, startedAt),
  status: () => runner.status(),
  api: { db },
  corsOrigins: config.corsOrigins,
  logLevel: config.logLevel,
});

await app.listen({ port: config.port, host: "127.0.0.1" });
app.log.info(
  {
    chainId: config.chainId,
    garden: config.garden.address,
    market: config.market.address,
    envFromFile: fromFile,
  },
  "indexer api ready",
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void (async () => {
      app.log.info({ signal }, "shutting down");
      await app.close();
      await pool.end();
      process.exit(0);
    })();
  });
}
