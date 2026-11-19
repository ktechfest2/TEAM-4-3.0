import "server-only";
import { PgBoss } from "pg-boss";
import { createDb, createPhoneCrypto, QUEUES, type DbHandle, type PhoneCrypto } from "@confam/db";

/**
 * Process-wide singletons. Next dev re-evaluates modules on HMR, so we park them on globalThis.
 * The web app only PRODUCES jobs; the brain runs the workers.
 */
const g = globalThis as unknown as { __confamDb?: DbHandle; __confamBoss?: Promise<PgBoss>; __confamCrypto?: PhoneCrypto };

export function getDb(): DbHandle {
  g.__confamDb ??= createDb(process.env.DATABASE_URL, { max: 8, statementTimeoutMs: 5000 });
  return g.__confamDb;
}

export function getCrypto(): PhoneCrypto {
  g.__confamCrypto ??= createPhoneCrypto();
  return g.__confamCrypto;
}

async function startProducer(): Promise<PgBoss> {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss", supervise: false, schedule: false, migrate: false });
  boss.on("error", (err) => console.error("pg-boss producer error", err));
  await boss.start();
  return boss;
}

export async function sendJob(name: (typeof QUEUES)[keyof typeof QUEUES], data: object, options: { singletonKey?: string } = {}): Promise<void> {
  g.__confamBoss ??= startProducer();
  const boss = await g.__confamBoss;
  await boss.send(name, data, options);
}
