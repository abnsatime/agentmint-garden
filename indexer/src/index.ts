import { createDb } from "./db/client.js";
import { loadDotEnv } from "./env-file.js";
import { loadConfig } from "./env.js";
import { buildServer } from "./server/app.js";
import { collectHealth } from "./server/health.js";

// A .env fills whatever the environment did not provide; explicit variables win.
const fromFile = loadDotEnv(".env");

const startedAt = Date.now();
const config = loadConfig();
const { db, pool } = createDb(config.databaseUrl);

const app = buildServer({
  health: () => collectHealth(db, config, startedAt),
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
