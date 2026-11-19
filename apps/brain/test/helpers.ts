import pg from "pg";
import pino from "pino";
import { sql } from "drizzle-orm";
import { createDb, createPhoneCrypto, migrateDb, QUEUES, seed, type DbHandle, type PhoneCrypto } from "@confam/db";
import { AethexClient } from "../src/aethex/client.ts";
import type { Config } from "../src/config.ts";
import type { AppDeps, JobQueue, SendOptions } from "../src/context.ts";
import { handleAlertGoNow, handleAlertNotice } from "../src/workers/alerts.ts";
import { handleAlertCase, handleCaseAggregate, handleCaseVerify, overrideVerdict } from "../src/workers/cases.ts";
import { handleDial } from "../src/workers/dial.ts";
import { handleSweepLateness } from "../src/workers/sweep.ts";
import { handleWebhook } from "../src/workers/webhook.ts";

export const TEAM = ["+12025550101", "+12025550102"]; // fictional 555-01xx numbers, never real phones
export const OUR_NUMBER = "+18648089401";
export const TOOL_KEY = "test-tool-key-0123456789abcdef0123";
export const WEBHOOK_SECRET = "whsec_test_secret";
export const OFFICIAL_PIN = "4826";
export const AGENTS = { hotline: "ag-hotline", verifier: "ag-verifier", alert: "ag-alert", official: "ag-official" };

const BASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://confam:confam@127.0.0.1:54330/confam_test";

export async function ensureTestDatabase(): Promise<void> {
  const url = new URL(BASE_URL);
  const dbName = url.pathname.slice(1);
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  const exists = await admin.query("select 1 from pg_database where datname = $1", [dbName]);
  if (exists.rowCount === 0) await admin.query(`create database "${dbName}"`);
  await admin.end();
}

/** In-memory stand-in for pg-boss that records jobs and can drain them through the real handlers. */
export class RecordingQueue implements JobQueue {
  jobs: { name: string; data: any; options?: SendOptions }[] = [];
  async send(name: string, data: object, options?: SendOptions) {
    this.jobs.push({ name, data, options });
    return String(this.jobs.length);
  }
  take(name: string) {
    const picked = this.jobs.filter((j) => j.name === name);
    this.jobs = this.jobs.filter((j) => j.name !== name);
    return picked;
  }
  /** Run queued jobs through the real handlers until nothing is left (or `only` queues are empty). */
  async drain(deps: AppDeps, only?: string[], maxRounds = 20) {
    for (let round = 0; round < maxRounds; round++) {
      const batch = this.jobs.filter((j) => !only || only.includes(j.name));
      if (batch.length === 0) return;
      this.jobs = this.jobs.filter((j) => !batch.includes(j));
      for (const j of batch) await runJob(deps, j.name, j.data);
    }
  }
}

export async function runJob(deps: AppDeps, name: string, data: any) {
  switch (name) {
    case QUEUES.caseVerify: return handleCaseVerify(deps, data);
    case QUEUES.caseAggregate: return handleCaseAggregate(deps, data);
    case QUEUES.caseOverride: return overrideVerdict(deps, data);
    case QUEUES.alertCase: return handleAlertCase(deps, data);
    case QUEUES.alertNotice: return handleAlertNotice(deps, data);
    case QUEUES.alertGoNow: return handleAlertGoNow(deps, data);
    case QUEUES.dial: return handleDial(deps, data);
    case QUEUES.webhook: return handleWebhook(deps, data);
    case QUEUES.sweepLateness: return handleSweepLateness(deps);
    default: throw new Error(`no handler for ${name}`);
  }
}

/** Fake Aethex HTTP API at the network boundary: call records (who is on the line) and outbound triggers. */
export class FakeAethex {
  calls = new Map<string, { id: string; direction: string; from_number: string; to_number: string; agent_id?: string }>();
  triggered: { agent_id: string; to_number: string; from_number: string; dynamic_variables: Record<string, unknown> }[] = [];
  failNextTrigger: { status: number; body: unknown } | null = null;
  private seq = 0;

  addInbound(from: string, agentId = AGENTS.hotline) {
    const id = `ca_in_${++this.seq}`;
    this.calls.set(id, { id, direction: "inbound", from_number: from, to_number: OUR_NUMBER, agent_id: agentId });
    return id;
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (init?.method === "POST" && path === "/calls/trigger") {
      if (this.failNextTrigger) {
        const f = this.failNextTrigger;
        this.failNextTrigger = null;
        return json(f.status, f.body);
      }
      const body = JSON.parse(String(init.body));
      this.triggered.push(body);
      const id = `ca_out_${++this.seq}`;
      this.calls.set(id, { id, direction: "outbound", from_number: body.from_number, to_number: body.to_number, agent_id: body.agent_id });
      return json(202, { id, status: "queued" });
    }
    const m = /^\/calls\/([^/]+)$/.exec(path);
    if (m && (!init?.method || init.method === "GET")) {
      const c = this.calls.get(decodeURIComponent(m[1]!));
      return c ? json(200, c) : json(404, { error: "not found" });
    }
    return json(404, { error: `fake aethex: unhandled ${init?.method ?? "GET"} ${path}` });
  };
}

export interface TestEnv {
  deps: AppDeps;
  handle: DbHandle;
  jobs: RecordingQueue;
  aethex: FakeAethex;
  crypto: PhoneCrypto;
  setNow(d: Date): void;
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    NODE_ENV: "test",
    PORT: 0,
    LOG_LEVEL: "silent",
    DATABASE_URL: BASE_URL,
    AETHEX_API_KEY: "test",
    AETHEX_BASE_URL: "https://aethex.test/api/v1",
    AETHEX_WEBHOOK_SECRET: WEBHOOK_SECRET,
    CONFAM_TOOL_KEY: TOOL_KEY,
    CONFAM_LINE_NUMBER: OUR_NUMBER,
    PUBLIC_BRAIN_URL: undefined,
    PHONE_PEPPER: Buffer.alloc(32, 1).toString("base64"),
    PHONE_ENC_KEY: Buffer.alloc(32, 2).toString("base64"),
    DEMO_MODE: true,
    DEMO_TEAM_PHONES: TEAM,
    ELECTION_TZ: "Africa/Lagos",
    AETHEX_AGENT_IDS: AGENTS,
    RUN_WORKERS: false,
    ...overrides,
  };
}

export async function createTestEnv(overrides: Partial<Config> = {}): Promise<TestEnv> {
  await ensureTestDatabase();
  const config = testConfig(overrides);
  const handle = createDb(config.DATABASE_URL, { max: 5, statementTimeoutMs: 10_000 });
  await migrateDb(handle.db);
  const crypto = createPhoneCrypto(config.PHONE_PEPPER, config.PHONE_ENC_KEY);
  const aethex = new FakeAethex();
  const jobs = new RecordingQueue();
  let now: Date | null = null;
  const deps: AppDeps = {
    config,
    db: handle.db,
    pool: handle.pool,
    crypto,
    aethex: new AethexClient({ apiKey: "test", baseUrl: config.AETHEX_BASE_URL, fetchImpl: aethex.fetch }),
    jobs,
    log: pino({ level: "silent" }),
    now: () => now ?? new Date(),
  };
  return { deps, handle, jobs, aethex, crypto, setNow: (d) => (now = d) };
}

export async function resetDb(env: TestEnv): Promise<void> {
  await env.handle.db.execute(sql`
    truncate table alert, outbound_attempt, call, webhook_event, report, verification_request, fact, claim_case,
      checkin, notice, subscription, role, person, polling_unit, ward, system_settings, admin_user restart identity cascade`);
  await seed(env.handle.db, env.crypto, { teamPhones: TEAM, officialPin: OFFICIAL_PIN });
  env.jobs.jobs = [];
  env.aethex.triggered = [];
}
