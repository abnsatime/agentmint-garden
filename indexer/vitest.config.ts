import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    clearMocks: true,
    // Database tests skip themselves when DATABASE_URL is absent.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
