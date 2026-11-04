import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDb>["db"];

/** A pool plus a drizzle client; both must be closed together on shutdown. */
export function createDb(connectionString: string, options: { max?: number } = {}) {
  const pool = new pg.Pool({ connectionString, max: options.max ?? 5 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
