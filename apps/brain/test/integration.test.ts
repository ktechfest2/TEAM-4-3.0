import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { alert, checkin, claimCase, fact, notice, outboundAttempt, person, pollingUnit, QUEUES, role, subscription, systemSettings, verificationRequest } from "@confam/db";
import { buildApp } from "../src/app.ts";
import { signAethexPayload } from "../src/webhooks/signature.ts";
import { AGENTS, createTestEnv, OFFICIAL_PIN, resetDb, TEAM, TOOL_KEY, WEBHOOK_SECRET, type TestEnv } from "./helpers.ts";

const [OFFICIAL, VOTER_A, VOTER_B] = TEAM as [string, string, string];
const PUBLIC = "+2348031230001"; // a caller who is not on any list

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
const pu = async (code: string) => (await env.deps.db.select().from(pollingUnit).where(eq(pollingUnit.code, code)))[0]!;

describe("http basics", () => {
  it("reports health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, db: "up" });
  });
  it("rejects a wrong tool key and agents outside a tool's allowlist", async () => {
    expect((await tool("lookup_polling_unit", { query: "ojuelegba" }, { key: "nope" })).status).toBe(401);
    expect((await tool("record_verifier_answer", { answer: "no" }, { agent: "hotline" })).status).toBe(403);
    expect((await tool("subscribe", {})).status).toBe(404); // retired: the voter list is managed by INEC
  });
  it("returns a speakable error for invalid arguments", async () => {
    const r = await tool("report_claim", { claim_en: "x" });
    expect(r.body.error).toBe("invalid_arguments");
    expect(r.body.say).toBeTruthy();
  });
});

describe("seed", () => {
  it("creates one official and two registered voters, and no fake contacts", async () => {
    const people = await env.deps.db.select().from(person);
    expect(people.filter((p) => !p.deletedAt)).toHaveLength(3);
    expect(people.every((p) => !p.isDemo)).toBe(true);
    const roles = await env.deps.db.select().from(role);
    expect(roles.map((r) => r.kind)).toEqual(["official"]);
    const voters = await env.deps.db.select().from(subscription).where(eq(subscription.kind, "voter"));
    expect(voters).toHaveLength(2);
  });
  it("never undoes control-room changes on reboot", async () => {
    const [voterSub] = await env.deps.db.select().from(subscription).where(eq(subscription.kind, "voter")).limit(1);
    const moved = await pu("LA-SUR-08-001");
    await env.deps.db.update(subscription).set({ puId: moved.id }).where(eq(subscription.id, voterSub!.id));
    const { seed } = await import("@confam/db");
    await seed(env.handle.db, env.crypto, { officialPhones: [OFFICIAL], voterPhones: [VOTER_A, VOTER_B], officialPin: OFFICIAL_PIN });
    const [after] = await env.deps.db.select().from(subscription).where(eq(subscription.id, voterSub!.id));
    expect(after!.puId).toBe(moved.id);
  });
});

describe("who is calling", () => {
  it("identifies officials, voters and the public", async () => {
    expect((await tool("identify_caller", {}, { callId: env.aethex.addInbound(OFFICIAL) })).body.caller_type).toBe("official");
    expect((await tool("identify_caller", {}, { callId: env.aethex.addInbound(VOTER_A) })).body.caller_type).toBe("voter");
    expect((await tool("identify_caller", {}, { callId: env.aethex.addInbound(PUBLIC) })).body.caller_type).toBe("public");
  });
  it("tells registered voters their polling unit, and everyone else to register with INEC", async () => {
    const v = await tool("my_polling_unit", {}, { callId: env.aethex.addInbound(VOTER_A) });
    expect(v.body).toMatchObject({ on_voter_list: true, moved: false });
    expect(v.body.say).toContain("Ojuelegba Primary School I");
    const p = await tool("my_polling_unit", {}, { callId: env.aethex.addInbound(PUBLIC) });
    expect(p.body.on_voter_list).toBe(false);
    expect(p.body.say).toContain("register");
  });
  it("tells a voter when their polling unit has been relocated", async () => {
    const oldPu = await pu("LA-SUR-05-001");
    const newPu = await pu("LA-SUR-05-003");
    await env.deps.db.update(pollingUnit).set({ status: "relocated", relocatedToId: newPu.id }).where(eq(pollingUnit.id, oldPu.id));
    const v = await tool("my_polling_unit", {}, { callId: env.aethex.addInbound(VOTER_B) });
    expect(v.body.moved).toBe(true);
    expect(v.body.say).toContain("St. Mary's Catholic School");
  });
});

describe("polling unit lookup", () => {
  it("finds a PU from a messy spoken description", async () => {
    const r = await tool("lookup_polling_unit", { query: "ojuelegba primary school" });
    expect(r.body.matches[0].code).toMatch(/^LA-SUR-05-00[12]$/);
    expect(r.body.say).toContain("has not moved");
  });
});

describe("rumours verified by the official on the ground", () => {
  it("calls the presiding officer, publishes their answer, calls the reporter back, and answers the next caller instantly", async () => {
    const first = await tool(
      "report_claim",
      { claim_en: "There is fighting at Ojuelegba polling unit", category: "violence", place: "Ojuelegba primary school", raw_text: "Ẹ jọ̀ọ́, wọ́n ti ń jà ní Ojuelegba" },
      { callId: env.aethex.addInbound(PUBLIC) },
    );
    expect(first.body.status).toBe("checking");
    const caseId = first.body.case_id as string;

    env.jobs.take(QUEUES.caseAggregate);
    await env.jobs.drain(env.deps, [QUEUES.caseVerify, QUEUES.dial]);
    const reqs = await env.deps.db.select().from(verificationRequest).where(eq(verificationRequest.caseId, caseId));
    expect(reqs).toHaveLength(1);
    expect(env.aethex.triggered).toHaveLength(1);
    expect(env.aethex.triggered[0]!).toMatchObject({ to_number: OFFICIAL, agent_id: AGENTS.verifier });
    expect(String(env.aethex.triggered[0]!.dynamic_variables.verifier_role)).toContain("presiding officer at Ojuelegba Primary School I");

    const ans = await tool("record_verifier_answer", { answer: "no", detail: "All calm, voting ongoing" }, { agent: "verifier", callId: reqs[0]!.aethexCallId! });
    expect(ans.body.ok).toBe(true);
    await env.jobs.drain(env.deps, [QUEUES.caseAggregate, QUEUES.alertCase, QUEUES.dial]);

    const [c] = await env.deps.db.select().from(claimCase).where(eq(claimCase.id, caseId));
    expect(c).toMatchObject({ status: "published", verdict: "false" });
    expect(c!.basis).toContain("The presiding officer at Ojuelegba Primary School I");
    const [f] = await env.deps.db.select().from(fact).where(eq(fact.caseId, caseId));
    expect(f!.scriptEn).toContain("presiding officer at Ojuelegba Primary School I told us directly");

    // Reporter (public) and the area's registered voters (violence = safety alert) are called.
    const called = env.aethex.triggered.filter((t) => t.agent_id === AGENTS.alert).map((t) => t.to_number).sort();
    expect(called).toEqual([PUBLIC, VOTER_A, VOTER_B].sort());

    const second = await tool(
      "report_claim",
      { claim_en: "People are fighting at Ojuelegba polling unit", category: "violence", place: "Ojuelegba primary school" },
      { callId: env.aethex.addInbound("+2348099999999") },
    );
    expect(second.body).toMatchObject({ status: "known", verdict: "false" });
  });

  it("answers 'officials have not arrived' instantly from the official's own check-in", async () => {
    await tool("official_checkin", { pin: OFFICIAL_PIN, event: "arrived" }, { callId: env.aethex.addInbound(OFFICIAL) });
    const r = await tool(
      "report_claim",
      { claim_en: "Officials have not arrived at Ojuelegba polling unit", category: "officials_absent", place: "Ojuelegba Primary School I" },
      { callId: env.aethex.addInbound(PUBLIC) },
    );
    expect(r.body).toMatchObject({ status: "known", verdict: "false" });
    expect(r.body.say).toContain("the officials arrived at");
    expect(await env.deps.db.select().from(claimCase)).toHaveLength(0);
  });

  it("falls back to officials elsewhere in the LGA when the unit has none, and is unverified if nobody answers", async () => {
    const r = await tool("report_claim", { claim_en: "Materials missing at Coker", category: "materials_missing", place: "Coker primary school" }, { callId: env.aethex.addInbound(PUBLIC) });
    env.jobs.take(QUEUES.caseAggregate);
    await env.jobs.drain(env.deps, [QUEUES.caseVerify, QUEUES.dial]);
    expect(env.aethex.triggered.map((t) => t.to_number)).toEqual([OFFICIAL]);
    env.setNow(new Date(Date.now() + 11 * 60_000));
    await env.deps.jobs.send(QUEUES.caseAggregate, { caseId: r.body.case_id, reason: "deadline" });
    await env.jobs.drain(env.deps, [QUEUES.caseAggregate]);
    const [c] = await env.deps.db.select().from(claimCase).where(eq(claimCase.id, r.body.case_id));
    expect(c!.verdict).toBe("unverified");
    env.setNow(new Date());
  });

  it("merges duplicate reports into one open case", async () => {
    const a = await tool("report_claim", { claim_en: "Vote buying at Ojuelegba", category: "vote_buying", place: "Ojuelegba" }, { callId: env.aethex.addInbound("+2348030000001") });
    const b = await tool("report_claim", { claim_en: "They are buying votes at Ojuelegba", category: "vote_buying", place: "Yaba Ojuelegba" }, { callId: env.aethex.addInbound("+2348030000002") });
    expect(a.body.case_id).toBe(b.body.case_id);
    expect(env.jobs.jobs.filter((j) => j.name === QUEUES.caseVerify)).toHaveLength(1);
  });

  it("lets the control room override a verdict and sends corrections", async () => {
    const r = await tool("report_claim", { claim_en: "Ballot box snatched at Coker", category: "result_tampering", place: "Coker primary school" }, { callId: env.aethex.addInbound(VOTER_A) });
    env.setNow(new Date(Date.now() + 11 * 60_000));
    env.jobs.take(QUEUES.caseVerify);
    await env.deps.jobs.send(QUEUES.caseAggregate, { caseId: r.body.case_id, reason: "deadline" });
    await env.jobs.drain(env.deps, [QUEUES.caseAggregate, QUEUES.alertCase, QUEUES.dial]);
    env.setNow(new Date());
    env.aethex.triggered = [];
    await env.deps.jobs.send(QUEUES.caseOverride, { caseId: r.body.case_id, verdict: "false", by: "admin@test" });
    await env.jobs.drain(env.deps, [QUEUES.caseOverride, QUEUES.alertCase, QUEUES.dial]);
    const facts = await env.deps.db.select().from(fact).where(eq(fact.caseId, r.body.case_id));
    expect(facts.filter((f) => f.supersededAt === null).map((f) => f.verdict)).toEqual(["false"]);
    expect(env.aethex.triggered.map((t) => t.to_number)).toEqual([VOTER_A]);
    expect(String(env.aethex.triggered[0]!.dynamic_variables.alert_script_en)).toContain("Correction");
  });

  it("asks for a clearer place when it cannot be resolved", async () => {
    const r = await tool("report_claim", { claim_en: "Fighting somewhere", category: "violence", place: "zzzz qqqq" }, { callId: env.aethex.addInbound(PUBLIC) });
    expect(r.body.status).toBe("need_place");
  });
});

describe("elderly and disability support (open to anyone)", () => {
  it("records a public caller's needs, alerts the official at check-in, and calls them to go", async () => {
    const elder = "+2348030000050";
    const s = await tool("request_accessibility_support", { polling_unit: "Ojuelegba Primary School I", needs: ["elderly", "mobility"], consent: true }, { callId: env.aethex.addInbound(elder) });
    expect(s.body.ok).toBe(true);
    expect(s.body.rights).toHaveLength(3);
    const [sub] = await env.deps.db.select().from(subscription).where(eq(subscription.kind, "assistance"));
    expect(sub!.needs).toEqual(["elderly", "mobility"]);

    const good = await tool("official_checkin", { pin: OFFICIAL_PIN, event: "arrived" }, { callId: env.aethex.addInbound(OFFICIAL) });
    expect(good.body.say).toContain("1 elderly or disabled voter is expected");
    await env.jobs.drain(env.deps, [QUEUES.alertGoNow, QUEUES.dial]);
    expect(env.aethex.triggered.map((t) => t.to_number)).toEqual([elder]);
    expect(String(env.aethex.triggered[0]!.dynamic_variables.alert_script_en)).toContain("officials have arrived");

    expect((await tool("unsubscribe", {}, { callId: env.aethex.addInbound(elder) })).body.ok).toBe(true);
  });
});

describe("officials", () => {
  it("locks out wrong PINs and records a valid check-in", async () => {
    const callId = env.aethex.addInbound(OFFICIAL);
    expect((await tool("official_checkin", { pin: "0000", event: "arrived" }, { callId })).body.ok).toBe(false);
    expect((await tool("official_checkin", { pin: OFFICIAL_PIN, event: "delay", eta_minutes: 20, note: "bus broke down" }, { callId })).body.ok).toBe(true);
    expect(await env.deps.db.select().from(checkin)).toHaveLength(1);
    const status = await tool("pu_status", { polling_unit: "Ojuelegba Primary School I" }, { callId: env.aethex.addInbound(PUBLIC) });
    expect(status.body.say).toContain("delay");
    expect(status.body.say).toContain("20 minutes");
  });
  it("rejects check-ins from numbers that are not officials", async () => {
    expect((await tool("official_checkin", { pin: OFFICIAL_PIN, event: "arrived" }, { callId: env.aethex.addInbound(VOTER_A) })).body.ok).toBe(false);
  });
  it("lateness sweep calls the PO, then a ward supervisor after 15 minutes", async () => {
    const [officialRole] = await env.deps.db.select().from(role).where(eq(role.kind, "official"));
    const [voterA] = await env.deps.db.select().from(person).where(eq(person.phoneHash, env.crypto.hash(VOTER_A)));
    await env.deps.db.insert(role).values({ personId: voterA!.id, kind: "supervisor", wardId: officialRole!.wardId });
    await env.deps.db.update(systemSettings).set({ electionDay: true, openingDeadline: "07:45" });
    const t0 = new Date("2027-01-16T07:00:00Z"); // 08:00 Lagos
    env.setNow(t0);
    await env.deps.jobs.send(QUEUES.sweepLateness, {});
    await env.jobs.drain(env.deps, [QUEUES.sweepLateness, QUEUES.dial]);
    expect(env.aethex.triggered.filter((t) => t.agent_id === AGENTS.official).map((c) => c.to_number)).toEqual([OFFICIAL]);
    env.setNow(new Date(t0.getTime() + 16 * 60_000));
    await env.deps.jobs.send(QUEUES.sweepLateness, {});
    await env.jobs.drain(env.deps, [QUEUES.sweepLateness, QUEUES.dial]);
    const sup = env.aethex.triggered.filter((t) => t.agent_id === AGENTS.official && t.dynamic_variables.call_role === "supervisor");
    expect(sup.map((c) => c.to_number)).toEqual([VOTER_A]);
    env.setNow(new Date());
  });
});

describe("polling unit changes", () => {
  it("relocation notice calls every registered voter of the unit, not assistance-only callers", async () => {
    await tool("request_accessibility_support", { polling_unit: "Ojuelegba Primary School I", needs: ["elderly"], consent: true }, { callId: env.aethex.addInbound("+2348030000060") });
    const oldPu = await pu("LA-SUR-05-001");
    const newPu = await pu("LA-SUR-05-003");
    const [n] = await env.deps.db.insert(notice).values({ puId: oldPu.id, kind: "relocation", body: "moved", newPuId: newPu.id, createdBy: "test" }).returning();
    await env.deps.jobs.send(QUEUES.alertNotice, { noticeId: n!.id });
    await env.jobs.drain(env.deps, [QUEUES.alertNotice, QUEUES.dial]);
    expect(env.aethex.triggered.map((t) => t.to_number).sort()).toEqual([VOTER_A, VOTER_B].sort());
    expect(String(env.aethex.triggered[0]!.dynamic_variables.alert_script_pcm)).toContain("St. Mary's Catholic School");
  });
  it("moving one voter calls only that voter, immediately (even in quiet hours)", async () => {
    await env.deps.db.update(systemSettings).set({ quietStart: "00:00", quietEnd: "23:59" });
    const [v] = await env.deps.db.select().from(person).where(eq(person.phoneHash, env.crypto.hash(VOTER_B)));
    const from = await pu("LA-SUR-05-001");
    const to = await pu("LA-SUR-06-002");
    await env.deps.jobs.send(QUEUES.alertTransfer, { personId: v!.id, fromPuId: from.id, toPuId: to.id, transferId: "00000000-0000-4000-8000-000000000001" });
    await env.jobs.drain(env.deps, [QUEUES.alertTransfer, QUEUES.dial]);
    expect(env.aethex.triggered.map((t) => t.to_number)).toEqual([VOTER_B]);
    expect(String(env.aethex.triggered[0]!.dynamic_variables.alert_script_en)).toContain("Igbaja Community Hall");
    const [a] = await env.deps.db.select().from(alert).where(eq(alert.kind, "transfer"));
    expect(a!.status).toBe("calling");
  });
});

describe("dialer guards", () => {
  it("holds everything while outbound is paused", async () => {
    await env.deps.db.update(systemSettings).set({ outboundPaused: true });
    const oldPu = await pu("LA-SUR-05-001");
    const newPu = await pu("LA-SUR-05-002");
    const [n] = await env.deps.db.insert(notice).values({ puId: oldPu.id, kind: "relocation", body: "moved", newPuId: newPu.id, createdBy: "test" }).returning();
    await env.deps.jobs.send(QUEUES.alertNotice, { noticeId: n!.id });
    await env.jobs.drain(env.deps, [QUEUES.alertNotice, QUEUES.dial]);
    expect(env.aethex.triggered).toHaveLength(0);
    expect(await env.deps.db.select().from(outboundAttempt).where(eq(outboundAttempt.decision, "skipped_paused"))).toHaveLength(2);
  });
  it("records carrier failures without crashing", async () => {
    env.aethex.failNextTrigger = { status: 403, body: { error: "Outbound not enabled", code: "outbound_disabled" } };
    const [v] = await env.deps.db.select().from(person).where(eq(person.phoneHash, env.crypto.hash(VOTER_A)));
    await env.deps.jobs.send(QUEUES.alertTransfer, { personId: v!.id, fromPuId: (await pu("LA-SUR-05-001")).id, toPuId: (await pu("LA-SUR-05-002")).id, transferId: "00000000-0000-4000-8000-000000000002" });
    await env.jobs.drain(env.deps, [QUEUES.alertTransfer, QUEUES.dial]);
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
    const body = { event_id: "evt_1", call_id: "ca_x", status: "completed", direction: "inbound", from_number: PUBLIC, to_number: "+18648089401", duration_seconds: 42 };
    expect((await post(body, "wrong")).statusCode).toBe(401);
    expect((await post(body)).json()).toEqual({ ok: true });
    expect((await post(body)).json()).toEqual({ ok: true, duplicate: true });
    await env.jobs.drain(env.deps, [QUEUES.webhook]);
    const rows = await env.deps.db.execute<{ n: number }>(sql`select count(*)::int as n from call where aethex_call_id = 'ca_x' and duration_s = 42`);
    expect(rows.rows[0]!.n).toBe(1);
  });
  it("retries an unanswered verification call once", async () => {
    const r = await tool("report_claim", { claim_en: "Vote buying at Ojuelegba", category: "vote_buying", place: "Ojuelegba" }, { callId: env.aethex.addInbound(PUBLIC) });
    env.jobs.take(QUEUES.caseAggregate);
    await env.jobs.drain(env.deps, [QUEUES.caseVerify, QUEUES.dial]);
    const [vr] = await env.deps.db.select().from(verificationRequest).where(and(eq(verificationRequest.caseId, r.body.case_id), eq(verificationRequest.status, "calling")));
    await post({ event_id: "evt_2", call_id: vr!.aethexCallId, status: "no-answer", direction: "outbound", from_number: "+18648089401", to_number: OFFICIAL });
    await env.jobs.drain(env.deps, [QUEUES.webhook]);
    const retry = env.jobs.jobs.find((j) => j.name === QUEUES.dial);
    expect(retry?.data.attempt).toBe(2);
    expect(retry?.options?.startAfter).toBe(180);
  });
});
