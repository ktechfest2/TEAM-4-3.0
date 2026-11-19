import pino from "pino";
import { createDb, createPhoneCrypto } from "@confam/db";
import { AethexClient } from "./aethex/client.ts";
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import type { AppDeps } from "./context.ts";
import { SimHandsets } from "./sim.ts";
import { bossQueue, startBoss, startWorkers } from "./workers/index.ts";

const config = loadConfig();
const log = pino({
  level: config.LOG_LEVEL,
  redact: { paths: ["req.headers.authorization", "req.headers[\"x-confam-tool-key\"]", "req.headers[\"x-api-key\"]", "*.phone", "*.from_number", "*.to_number"], censor: "[redacted]" },
});

const { db, pool, close } = createDb(config.DATABASE_URL, { max: 15, statementTimeoutMs: 2000 });
const boss = await startBoss(config.DATABASE_URL);
const deps: AppDeps = {
  config,
  db,
  pool,
  crypto: createPhoneCrypto(config.PHONE_PEPPER, config.PHONE_ENC_KEY),
  aethex: new AethexClient({ apiKey: config.AETHEX_API_KEY, baseUrl: config.AETHEX_BASE_URL }),
  jobs: bossQueue(boss),
  log,
  ...(config.SIM_HANDSET_PREFIX ? { sim: new SimHandsets() } : {}),
};
if (config.SIM_HANDSET_PREFIX && !config.RUN_WORKERS) log.warn("SIM_HANDSET_PREFIX needs RUN_WORKERS in the same process: parked sessions live in memory");

if (!config.AETHEX_WEBHOOK_SECRET) log.warn("AETHEX_WEBHOOK_SECRET is empty: all webhooks will be rejected until provisioning sets it");
for (const k of ["hotline", "verifier", "alert", "official"] as const) {
  if (!config.AETHEX_AGENT_IDS[k]) log.warn({ agent: k }, "Aethex agent id missing: run npm run provision:aethex");
}

if (config.RUN_WORKERS) await startWorkers(boss, deps);
const app = await buildApp(deps);
await app.listen({ port: config.PORT, host: "0.0.0.0" });

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "shutting down");
  await app.close().catch(() => {});
  await boss.stop({ graceful: true, timeout: 10_000 }).catch(() => {});
  await close().catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
