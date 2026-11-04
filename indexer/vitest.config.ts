import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    clearMocks: true,
    // The database suites share one PostgreSQL instance and clean their tables between tests,
    // so files must not run concurrently.
    fileParallelism: false,
    sequence: { concurrent: false },
    // Database tests skip themselves when DATABASE_URL is absent.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
