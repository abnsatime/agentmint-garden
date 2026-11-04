import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? "postgres://garden:garden@127.0.0.1:5432/garden";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
