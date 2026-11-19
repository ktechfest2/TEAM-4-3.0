import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { alert, checkin, claimCase, fact, notice, outboundAttempt, pollingUnit, QUEUES, subscription, systemSettings, verificationRequest } from "@confam/db";
import { buildApp } from "../src/app.ts";
import { signAethexPayload } from "../src/webhooks/signature.ts";
import { AGENTS, createTestEnv, OFFICIAL_PIN, resetDb, TEAM, TOOL_KEY, WEBHOOK_SECRET, type TestEnv } from "./helpers.ts";

let env: TestEnv;
let app: FastifyInstance;

beforeAll(async () => {
  env = await createTestEnv();
  app = await buildApp(env.deps);
});
afterAll(async () => {
  await app.close();
  await env.handle.close();
});
beforeEach(async () => {
  await resetDb(env);
});

async function tool(name: string, args: Record<string, unknown>, opts: { agent?: keyof typeof AGENTS; callId?: string; key?: string } = {}) {
  const res = await app.inject({
    method: "POST",
    url: `/tools/${name}`,
    headers: { "content-type": "application/json", "x-confam-tool-key": opts.key ?? TOOL_KEY },
    payload: { arguments: args, agent_id: AGENTS[opts.agent ?? "hotline"], conversation_id: "co_1", call_id: opts.callId },
  });
  return { status: res.statusCode, body: res.json() as Record<string, any> };
}

describe("http basics", () => {
  it("reports health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, db: "up" });
  });
  it("rejects a wrong tool key and agents outside a tool's allowlist", async () => {
    expect((await tool("lookup_polling_unit", { query: "ojuelegba" }, { key: "nope" })).status).toBe(401);
    expect((await tool("record_verifier_answer", { answer: "no" }, { agent: "hotline" })).status).toBe(403);
    expect((await tool("does_not_exist", {})).status).toBe(404);
  });
  it("returns a speakable error for invalid arguments", async () => {
    const r = await tool("report_claim", { claim_en: "x" });
    expect(r.status).toBe(200);
    expect(r.body.error).toBe("invalid_arguments");
    expect(r.body.say).toBeTruthy();
  });
});

describe("polling units", () => {
  it("finds a PU from a messy spoken description", async () => {
    const r = await tool("lookup_polling_unit", { query: "ojuelegba primary school" });
    expect(r.body.matches[0].code).toMatch(/^LA-SUR-05-00[12]$/);
    expect(r.body.say).toContain("has not moved");
  });
  it("tells callers about a relocation", async () => {
    const [oldPu] = await env.deps.db.select().from(pollingUnit).where(eq(pollingUnit.code, "LA-SUR-05-001"));
    const [newPu] = await env.deps.db.select().from(pollingUnit).where(eq(pollingUnit.code, "LA-SUR-05-003"));
    await env.deps.db.update(pollingUnit).set({ status: "relocated", relocatedToId: newPu!.id }).where(eq(pollingUnit.id, oldPu!.id));
    const r = await tool("lookup_polling_unit", { query: "LA-SUR-05-001" });
    expect(r.body.say).toContain("RELOCATED");
    expect(r.body.say).toContain("St. Mary's Catholic School");
  });
});

describe("rumour pipeline (end to end)", () => {
  it("opens a case, calls verifiers, publishes a verdict, answers the next caller instantly", async () => {
    const reporterCall = env.aethex.addInbound("+2348031234567");
    const first = await tool(
      "report_claim",
      { claim_en: "There is fighting at Ojuelegba polling unit", category: "violence", place: "Ojuelegba", raw_text: "Ẹ jọ̀ọ́, wọ́n ti ń jà ní Ojuelegba" },
      { callId: reporterCall },
    );
    expect(first.body.status).toBe("checking");
    const caseId = first.body.case_id as string;
    expect(env.jobs.jobs.map((j) => j.name)).toEqual(expect.arrayContaining([QUEUES.caseVerify, QUEUES.caseAggregate]));

    // Verification: picks ward verifiers, dials only team phones, skips demo contacts.
    env.jobs.take(QUEUES.caseAggregate); // deadline job, not due yet
    await env.jobs.drain(env.deps, [QUEUES.caseVerify, QUEUES.dial]);
    const reqs = await env.deps.db.select().from(verificationRequest).where(eq(verificationRequest.caseId, caseId));
    expect(reqs.length).toBe(4); // 2 team + 2 demo verifiers in YABA/OJUELEGBA
    expect(reqs.filter((r) => r.status === "calling")).toHaveLength(2);
    expect(reqs.filter((r) => r.status === "skipped")).toHaveLength(2);
    expect(env.aethex.triggered.map((t) => t.to_number).sort()).toEqual([...TEAM].sort());
    expect(env.aethex.triggered[0]!.agent_id).toBe(AGENTS.verifier);
    expect(String(env.aethex.triggered[0]!.dynamic_variables.case_question)).toContain("fighting");
    const skipped = await env.deps.db.select().from(outboundAttempt).where(eq(outboundAttempt.decision, "skipped_demo_contact"));
    expect(skipped).toHaveLength(2);

    // Both team verifiers answer "no" on their calls.
    for (const r of reqs.filter((x) => x.status === "calling")) {
      const ans = await tool("record_verifier_answer", { answer: "no", detail: "All calm, voting ongoing" }, { agent: "verifier", callId: r.aethexCallId! });
      expect(ans.body.ok).toBe(true);
    }
    await env.jobs.drain(env.deps, [QUEUES.caseAggregate, QUEUES.alertCase, QUEUES.dial]);

    const [c] = await env.deps.db.select().from(claimCase).where(eq(claimCase.id, caseId));
    expect(c).toMatchObject({ status: "published", verdict: "false" });
    const [f] = await env.deps.db.select().from(fact).where(eq(fact.caseId, caseId));
    expect(f!.scriptPcm).toContain("no true");

    // Reporter gets a callback alert; in demo mode a non-team number is not dialled.
    const alerts = await env.deps.db.select().from(alert).where(eq(alert.refId, f!.id));
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    const notAllowed = await env.deps.db.select().from(outboundAttempt).where(eq(outboundAttempt.decision, "skipped_not_allowlisted"));
    expect(notAllowed.length).toBeGreaterThanOrEqual(1);

    // The next caller asking about the same rumour gets the verified answer in-call.
    const second = await tool(
      "report_claim",
      { claim_en: "People are fighting at Ojuelegba polling unit", category: "violence", place: "Ojuelegba primary school" },
      { callId: env.aethex.addInbound("+2348099999999") },
    );
    expect(second.body.status).toBe("known");
    expect(second.body.verdict).toBe("false");
    expect(second.body.say).toContain("not true");
  });

  it("merges duplicate reports into one open case", async () => {
    const a = await tool("report_claim", { claim_en: "Vote buying at Ojuelegba", category: "vote_buying", place: "Ojuelegba" }, { callId: env.aethex.addInbound("+2348030000001") });
    const b = await tool("report_claim", { claim_en: "They are buying votes at Ojuelegba", category: "vote_buying", place: "Yaba Ojuelegba" }, { callId: env.aethex.addInbound("+2348030000002") });
    expect(a.body.case_id).toBe(b.body.case_id);
    expect(env.jobs.jobs.filter((j) => j.name === QUEUES.caseVerify)).toHaveLength(1);
  });

  it("publishes unverified when nobody answers by the deadline", async () => {
    const r = await tool("report_claim", { claim_en: "Materials missing at the stadium", category: "materials_missing", place: "National Stadium" }, { callId: env.aethex.addInbound("+2348030000003") });
    env.setNow(new Date(Date.now() + 11 * 60_000));
    await env.deps.jobs.send(QUEUES.caseAggregate, { caseId: r.body.case_id, reason: "deadline" });
    await env.jobs.drain(env.deps, [QUEUES.caseAggregate]);
    const [c] = await env.deps.db.select().from(claimCase).where(eq(claimCase.id, r.body.case_id));
    expect(c!.verdict).toBe("unverified");
    env.setNow(new Date());
  });

  it("asks for a clearer place when it cannot be resolved", async () => {
    const r = await tool("report_claim", { claim_en: "Fighting somewhere", category: "violence", place: "zzzz qqqq" }, { callId: env.aethex.addInbound("+2348030000004") });
    expect(r.body.status).toBe("need_place");
  });
});

describe("subscriptions and accessibility", () => {
  it("subscribes with consent and needs, and unsubscribes", async () => {
    const callId = env.aethex.addInbound("+2348030000010");
    const s = await tool("request_accessibility_support", { polling_unit: "Igbaja community hall", needs: ["elderly", "low_vision"], consent: true }, { callId });
    expect(s.body.ok).toBe(true);
    expect(s.body.rights).toHaveLength(3);
    const u = await tool("unsubscribe", {}, { callId });
    expect(u.body.ok).toBe(true);
    const active = await env.deps.db.select().from(subscription).where(eq(subscription.active, true));
    expect(active.every((x) => x.needs.join() !== "elderly,low_vision")).toBe(true);
  });
  it("refuses to subscribe without consent", async () => {
    const r = await tool("subscribe", { polling_unit: "Coker", consent: false }, { callId: env.aethex.addInbound("+2348030000011") });
    expect(r.body.error).toBe("invalid_arguments");
  });
});

describe("officials", () => {
  it("locks out wrong PINs and records a valid check-in, then triggers go-now alerts", async () => {
    const callId = env.aethex.addInbound(TEAM[0]!);
    const bad = await tool("official_checkin", { pin: "0000", event: "arrived" }, { callId });
    expect(bad.body.ok).toBe(false);
    const good = await tool("official_checkin", { pin: OFFICIAL_PIN, event: "arrived" }, { callId });
    expect(good.body.ok).toBe(true);
    expect(good.body.say).toContain("elderly or disabled");
    const rows = await env.deps.db.select().from(checkin);
    expect(rows).toHaveLength(1);
    await env.jobs.drain(env.deps, [QUEUES.alertGoNow, QUEUES.dial]);
    const goNow = await env.deps.db.select().from(alert).where(eq(alert.kind, "go_now"));
    expect(goNow.length).toBe(2); // Mama Ronke + Baba Sule (demo contacts, skipped)
    expect(goNow.every((a) => a.status === "skipped")).toBe(true);

    const status = await tool("pu_status", { polling_unit: "Ojuelegba Primary School I" }, { callId: env.aethex.addInbound("+2348030000012") });
    expect(status.body.say).toContain("officials arrived");
  });
  it("rejects check-ins from numbers that are not officials", async () => {
    const r = await tool("official_checkin", { pin: OFFICIAL_PIN, event: "arrived" }, { callId: env.aethex.addInbound("+2348030000013") });
    expect(r.body.ok).toBe(false);
  });
  it("lateness sweep calls the PO, then the supervisor after 15 minutes", async () => {
    await env.deps.db.update(systemSettings).set({ electionDay: true, openingDeadline: "07:45" });
    const t0 = new Date("2027-01-16T07:00:00Z"); // 08:00 Lagos
    env.setNow(t0);
    await env.deps.jobs.send(QUEUES.sweepLateness, {});
    await env.jobs.drain(env.deps, [QUEUES.sweepLateness, QUEUES.dial]);
    const poCalls = env.aethex.triggered.filter((t) => t.agent_id === AGENTS.official);
    expect(poCalls.map((c) => c.to_number)).toEqual([TEAM[0]]); // only the team PO is real; demo POs skipped
    env.setNow(new Date(t0.getTime() + 16 * 60_000));
    await env.deps.jobs.send(QUEUES.sweepLateness, {});
    await env.jobs.drain(env.deps, [QUEUES.sweepLateness, QUEUES.dial]);
    const supCalls = env.aethex.triggered.filter((t) => t.agent_id === AGENTS.official && t.dynamic_variables.call_role === "supervisor");
    expect(supCalls.map((c) => c.to_number)).toEqual([TEAM[1]]);
    env.setNow(new Date());
  });
});

describe("relocation notices", () => {
  it("queues alerts for every subscriber of the old PU", async () => {
    const [oldPu] = await env.deps.db.select().from(pollingUnit).where(eq(pollingUnit.code, "LA-SUR-05-001"));
    const [newPu] = await env.deps.db.select().from(pollingUnit).where(eq(pollingUnit.code, "LA-SUR-05-003"));
    const [n] = await env.deps.db.insert(notice).values({ puId: oldPu!.id, kind: "relocation", body: "moved", newPuId: newPu!.id, createdBy: "test" }).returning();
    await env.deps.jobs.send(QUEUES.alertNotice, { noticeId: n!.id });
    await env.jobs.drain(env.deps, [QUEUES.alertNotice, QUEUES.dial]);
    const rows = await env.deps.db.select().from(alert).where(eq(alert.kind, "notice"));
    expect(rows.length).toBe(4); // 3 demo + team phone 2
    expect(env.aethex.triggered.map((t) => t.to_number)).toEqual([TEAM[1]]);
    expect(String(env.aethex.triggered[0]!.dynamic_variables.alert_script_pcm)).toContain("St. Mary's Catholic School");
  });
});

describe("dialer guards", () => {
  it("skips everything while outbound is paused", async () => {
    await env.deps.db.update(systemSettings).set({ outboundPaused: true });
    const [oldPu] = await env.deps.db.select().from(pollingUnit).where(eq(pollingUnit.code, "LA-SUR-05-001"));
    const [newPu] = await env.deps.db.select().from(pollingUnit).where(eq(pollingUnit.code, "LA-SUR-05-002"));
    const [n] = await env.deps.db.insert(notice).values({ puId: oldPu!.id, kind: "relocation", body: "moved", newPuId: newPu!.id, createdBy: "test" }).returning();
    await env.deps.jobs.send(QUEUES.alertNotice, { noticeId: n!.id });
    await env.jobs.drain(env.deps, [QUEUES.alertNotice, QUEUES.dial]);
    expect(env.aethex.triggered).toHaveLength(0);
    const paused = await env.deps.db.select().from(outboundAttempt).where(eq(outboundAttempt.decision, "skipped_paused"));
    expect(paused.length).toBe(4);
  });
  it("records Aethex/Telnyx failures without crashing", async () => {
    env.aethex.failNextTrigger = { status: 403, body: { error: "Outbound not enabled", code: "outbound_disabled" } };
    const [oldPu] = await env.deps.db.select().from(pollingUnit).where(eq(pollingUnit.code, "LA-SUR-05-001"));
    const [newPu] = await env.deps.db.select().from(pollingUnit).where(eq(pollingUnit.code, "LA-SUR-05-002"));
    const [n] = await env.deps.db.insert(notice).values({ puId: oldPu!.id, kind: "relocation", body: "moved", newPuId: newPu!.id, createdBy: "test" }).returning();
    await env.deps.jobs.send(QUEUES.alertNotice, { noticeId: n!.id });
    await env.jobs.drain(env.deps, [QUEUES.alertNotice, QUEUES.dial]);
    const errors = await env.deps.db.select().from(outboundAttempt).where(eq(outboundAttempt.decision, "error"));
    expect(errors).toHaveLength(1);
    expect(errors[0]!.error).toContain("outbound_disabled");
  });
});

describe("aethex webhooks", () => {
  async function post(body: object, secret = WEBHOOK_SECRET) {
    const raw = JSON.stringify(body);
    return app.inject({
      method: "POST",
      url: "/webhooks/aethex",
      headers: { "content-type": "application/json", "x-aethex-event": "call.ended", "x-aethex-signature": signAethexPayload(raw, secret) },
      payload: raw,
    });
  }
  it("rejects bad signatures and dedupes replays", async () => {
    const body = { event_id: "evt_1", call_id: "ca_x", status: "completed", direction: "inbound", from_number: "+2348030000099", to_number: "+18648089401", duration_seconds: 42 };
    expect((await post(body, "wrong")).statusCode).toBe(401);
    expect((await post(body)).json()).toEqual({ ok: true });
    expect((await post(body)).json()).toEqual({ ok: true, duplicate: true });
    await env.jobs.drain(env.deps, [QUEUES.webhook]);
    const rows = await env.deps.db.execute<{ n: number }>(sql`select count(*)::int as n from call where aethex_call_id = 'ca_x' and duration_s = 42`);
    expect(rows.rows[0]!.n).toBe(1);
  });
  it("marks unanswered verification calls and retries once", async () => {
    const r = await tool("report_claim", { claim_en: "Officials absent at Ojuelegba", category: "officials_absent", place: "Ojuelegba" }, { callId: env.aethex.addInbound("+2348030000020") });
    env.jobs.take(QUEUES.caseAggregate);
    await env.jobs.drain(env.deps, [QUEUES.caseVerify, QUEUES.dial]);
    const [vr] = await env.deps.db.select().from(verificationRequest).where(and(eq(verificationRequest.caseId, r.body.case_id), eq(verificationRequest.status, "calling")));
    await post({ event_id: "evt_2", call_id: vr!.aethexCallId, status: "no-answer", direction: "outbound", from_number: "+18648089401", to_number: TEAM[0] });
    await env.jobs.drain(env.deps, [QUEUES.webhook]);
    const retry = env.jobs.jobs.find((j) => j.name === QUEUES.dial);
    expect(retry?.data.attempt).toBe(2);
    expect(retry?.options?.startAfter).toBe(180);
  });
});
