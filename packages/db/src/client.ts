import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.ts";

export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
  close(): Promise<void>;
}

export function createDb(connectionString = process.env.DATABASE_URL, opts: { max?: number; statementTimeoutMs?: number } = {}): DbHandle {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({
    connectionString,
    max: opts.max ?? 10,
    statement_timeout: opts.statementTimeoutMs ?? 5000,
    idleTimeoutMillis: 30_000,
  });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

/** Channel used for live dashboard updates via LISTEN/NOTIFY. */
export const EVENTS_CHANNEL = "confam_events";

export type ConfamEvent =
  | { type: "case"; id: string }
  | { type: "checkin"; puId: string }
  | { type: "call"; id: string }
  | { type: "alert"; id: string }
  | { type: "outbound"; id: string }
  | { type: "settings" }
  | { type: "notice"; id: string }
  | { type: "person"; id: string };

export async function notify(pool: pg.Pool | pg.PoolClient, event: ConfamEvent): Promise<void> {
  await pool.query("select pg_notify($1, $2)", [EVENTS_CHANNEL, JSON.stringify(event)]);
}
