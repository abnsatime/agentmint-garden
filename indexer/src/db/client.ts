import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof createDb>["db"];

/**
 * The query surface shared by the pool client and a transaction, so writers can take either
 * without caring which one they were handed.
 */
export type DbClient = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;

/** A pool plus a drizzle client; both must be closed together on shutdown. */
export function createDb(connectionString: string, options: { max?: number } = {}) {
  const pool = new pg.Pool({ connectionString, max: options.max ?? 5 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}
