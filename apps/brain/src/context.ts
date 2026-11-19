import type { Logger } from "pino";
import type pg from "pg";
import type { Db, PhoneCrypto } from "@confam/db";
import type { AethexClient } from "./aethex/client.ts";
import type { Config } from "./config.ts";
import type { SimHandsets } from "./sim.ts";

export interface SendOptions {
  startAfter?: number | Date;
  singletonKey?: string;
  retryLimit?: number;
  retryDelay?: number;
  retryBackoff?: boolean;
}

/** The subset of pg-boss we use, so tests can substitute an in-memory recorder. */
export interface JobQueue {
  send(name: string, data: object, options?: SendOptions): Promise<string | null>;
}

export interface AppDeps {
  config: Config;
  db: Db;
  pool: pg.Pool;
  crypto: PhoneCrypto;
  aethex: AethexClient;
  jobs: JobQueue;
  log: Logger;
  now?: () => Date;
  /** Present when SIM_HANDSET_PREFIX is set. */
  sim?: SimHandsets;
}
