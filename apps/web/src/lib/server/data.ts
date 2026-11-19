import "server-only";
import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import {
  alert,
  call,
  checkin,
  claimCase,
  fact,
  notice,
  outboundAttempt,
  person,
  pollingUnit,
  report,
  role,
  subscription,
  systemSettings,
  verificationRequest,
  ward,
} from "@confam/db";
import { getDb } from "./db";

const db = () => getDb().db;
const dayAgo = () => new Date(Date.now() - 24 * 3600_000);

export const mask = (last4: string) => `•••• ${last4}`;

export type Settings = typeof systemSettings.$inferSelect;

export async function getSettings(): Promise<Settings> {
  const [s] = await db().select().from(systemSettings).limit(1);
  if (s) return s;
  const [created] = await db().insert(systemSettings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db().select().from(systemSettings).limit(1))[0]!;
}

export interface FeedItem {
  id: string;
  kind: "report" | "verdict" | "checkin" | "outbound" | "call";
  at: Date;
  title: string;
  detail: string;
  tone: "neutral" | "good" | "bad" | "warn" | "ink";
  href?: string;
}

const OUTBOUND_LABEL: Record<string, string> = {
  verify: "Verifier call",
  case_alert: "Verdict callback",
  notice_alert: "Relocation alert",
  go_now: "Go-now call",
  late_official: "Late-official call",
  late_supervisor: "Supervisor escalation",
};
const DECISION_LABEL: Record<string, string> = {
  dialled: "dialled",
  skipped_paused: "held (outbound paused)",
  skipped_demo_contact: "simulated (demo contact)",
  skipped_not_allowlisted: "held (not a team phone)",
  skipped_cooldown: "held (cooldown)",
  skipped_quiet_hours: "held (quiet hours)",
  skipped_no_phone: "no phone on file",
  error: "failed",
};
const EVENT_LABEL: Record<string, string> = {
  arrived: "officials arrived",
  materials_received: "materials received",
  voting_started: "voting started",
  delay: "delay reported",
  issue: "issue reported",
  closed: "voting closed",
};
export const eventLabel = (e: string) => EVENT_LABEL[e] ?? e;
export const outboundLabel = (p: string) => OUTBOUND_LABEL[p] ?? p;
export const decisionLabel = (d: string) => DECISION_LABEL[d] ?? d;

export async function getFeed(limit = 24): Promise<FeedItem[]> {
  const since = dayAgo();
  const [reports, verdicts, checkins, attempts] = await Promise.all([
    db()
      .select({ id: report.id, at: report.createdAt, claim: report.claimEn, caseId: report.caseId })
      .from(report)
      .where(gte(report.createdAt, since))
      .orderBy(desc(report.createdAt))
      .limit(limit),
    db()
      .select({ id: claimCase.id, at: claimCase.publishedAt, claim: claimCase.claimEn, verdict: claimCase.verdict, overriddenBy: claimCase.overriddenBy })
      .from(claimCase)
      .where(and(eq(claimCase.status, "published"), gte(claimCase.publishedAt, since)))
      .orderBy(desc(claimCase.publishedAt))
      .limit(limit),
    db()
      .select({ id: checkin.id, at: checkin.at, event: checkin.event, pu: pollingUnit.name, eta: checkin.etaMinutes })
      .from(checkin)
      .innerJoin(pollingUnit, eq(pollingUnit.id, checkin.puId))
      .where(gte(checkin.at, since))
      .orderBy(desc(checkin.at))
      .limit(limit),
    db()
      .select({ id: outboundAttempt.id, at: outboundAttempt.at, purpose: outboundAttempt.purpose, decision: outboundAttempt.decision, name: person.displayName })
      .from(outboundAttempt)
      .leftJoin(person, eq(person.id, outboundAttempt.personId))
      .where(gte(outboundAttempt.at, since))
      .orderBy(desc(outboundAttempt.at))
      .limit(limit),
  ]);
  const items: FeedItem[] = [
    ...reports.map((r) => ({ id: `r-${r.id}`, kind: "report" as const, at: r.at, title: "Rumour reported", detail: r.claim, tone: "warn" as const, href: `/rumours/${r.caseId}` })),
    ...verdicts.map((v) => ({
      id: `v-${v.id}`,
      kind: "verdict" as const,
      at: v.at!,
      title: v.overriddenBy ? `Verdict set: ${v.verdict}` : `Verdict: ${v.verdict}`,
      detail: v.claim,
      tone: (v.verdict === "false" ? "good" : v.verdict === "confirmed" ? "bad" : "neutral") as FeedItem["tone"],
      href: `/rumours/${v.id}`,
    })),
    ...checkins.map((c) => ({
      id: `c-${c.id}`,
      kind: "checkin" as const,
      at: c.at,
      title: `${c.pu}: ${eventLabel(c.event)}`,
      detail: c.event === "delay" && c.eta ? `ETA ${c.eta} min` : "Official check-in",
      tone: (c.event === "delay" || c.event === "issue" ? "warn" : "good") as FeedItem["tone"],
      href: "/units",
    })),
    ...attempts.map((a) => ({
      id: `o-${a.id}`,
      kind: "outbound" as const,
      at: a.at,
      title: `${outboundLabel(a.purpose)}: ${decisionLabel(a.decision)}`,
      detail: a.name ?? "Unknown person",
      tone: (a.decision === "error" ? "bad" : a.decision === "dialled" ? "ink" : "neutral") as FeedItem["tone"],
      href: "/calls",
    })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export interface WardTile {
  id: string;
  name: string;
  units: number;
  openCases: number;
  arrived: number;
  withOfficials: number;
  subscribers: number;
}

export async function getWardBoard(): Promise<WardTile[]> {
  const res = await db().execute<{ id: string; name: string; units: number; open_cases: number; arrived: number; with_officials: number; subscribers: number }>(sql`
    select w.id, w.name,
      (select count(*)::int from polling_unit pu where pu.ward_id = w.id) as units,
      (select count(*)::int from claim_case c where c.ward_id = w.id and c.status = 'verifying') as open_cases,
      (select count(distinct ck.pu_id)::int from checkin ck join polling_unit pu on pu.id = ck.pu_id
         where pu.ward_id = w.id and ck.event in ('arrived','voting_started') and ck.at > now() - interval '18 hours') as arrived,
      (select count(distinct r.pu_id)::int from role r where r.ward_id = w.id and r.kind = 'official' and r.pu_id is not null) as with_officials,
      (select count(*)::int from subscription s join polling_unit pu on pu.id = s.pu_id where pu.ward_id = w.id and s.active and s.kind = 'voter') as subscribers
    from ward w order by w.code`);
  return res.rows.map((r) => ({ id: r.id, name: r.name, units: r.units, openCases: r.open_cases, arrived: r.arrived, withOfficials: r.with_officials, subscribers: r.subscribers }));
}

export async function getCounters() {
  const since = dayAgo();
  const [[open], [published], [calls], [outbound], [blocked], [subs]] = await Promise.all([
    db().select({ n: count() }).from(claimCase).where(eq(claimCase.status, "verifying")),
    db().select({ n: count() }).from(claimCase).where(and(eq(claimCase.status, "published"), gte(claimCase.publishedAt, since))),
    db().select({ n: count() }).from(call).where(and(eq(call.direction, "inbound"), gte(call.createdAt, since))),
    db().select({ n: count() }).from(outboundAttempt).where(and(eq(outboundAttempt.decision, "dialled"), gte(outboundAttempt.at, since))),
    db().select({ n: count() }).from(outboundAttempt).where(and(eq(outboundAttempt.decision, "error"), gte(outboundAttempt.at, since))),
    db().select({ n: count() }).from(subscription).where(and(eq(subscription.active, true), eq(subscription.kind, "voter"))),
  ]);
  return { open: open!.n, published: published!.n, inboundCalls: calls!.n, outboundDialled: outbound!.n, outboundFailed: blocked!.n, subscribers: subs!.n };
}

export async function listCases(status?: "verifying" | "published") {
  const rows = await db()
    .select({
      id: claimCase.id,
      category: claimCase.category,
      claim: claimCase.claimEn,
      status: claimCase.status,
      verdict: claimCase.verdict,
      confidence: claimCase.confidence,
      createdAt: claimCase.createdAt,
      publishedAt: claimCase.publishedAt,
      deadlineAt: claimCase.deadlineAt,
      overriddenBy: claimCase.overriddenBy,
      ward: ward.name,
      pu: pollingUnit.name,
      reports: sql<number>`(select count(*)::int from report r where r.case_id = ${claimCase.id})`,
      answered: sql<number>`(select count(*)::int from verification_request v where v.case_id = ${claimCase.id} and v.status = 'answered')`,
      asked: sql<number>`(select count(*)::int from verification_request v where v.case_id = ${claimCase.id})`,
    })
    .from(claimCase)
    .leftJoin(ward, eq(ward.id, claimCase.wardId))
    .leftJoin(pollingUnit, eq(pollingUnit.id, claimCase.puId))
    .where(status ? eq(claimCase.status, status) : undefined)
    .orderBy(desc(claimCase.createdAt))
    .limit(100);
  return rows;
}
export type CaseRow = Awaited<ReturnType<typeof listCases>>[number];

export async function getCase(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [c] = await db()
    .select({ c: claimCase, ward: ward.name, pu: pollingUnit.name })
    .from(claimCase)
    .leftJoin(ward, eq(ward.id, claimCase.wardId))
    .leftJoin(pollingUnit, eq(pollingUnit.id, claimCase.puId))
    .where(eq(claimCase.id, id));
  if (!c) return null;
  const [reports, requests, facts] = await Promise.all([
    db()
      .select({ id: report.id, at: report.createdAt, claim: report.claimEn, raw: report.rawText, name: person.displayName, last4: person.phoneLast4 })
      .from(report)
      .leftJoin(person, eq(person.id, report.personId))
      .where(eq(report.caseId, id))
      .orderBy(report.createdAt),
    db()
      .select({
        id: verificationRequest.id,
        status: verificationRequest.status,
        answer: verificationRequest.answer,
        detail: verificationRequest.detail,
        weight: verificationRequest.weight,
        affiliation: verificationRequest.affiliation,
        attempts: verificationRequest.attempts,
        answeredAt: verificationRequest.answeredAt,
        name: person.displayName,
        last4: person.phoneLast4,
        isDemo: person.isDemo,
      })
      .from(verificationRequest)
      .innerJoin(person, eq(person.id, verificationRequest.personId))
      .where(eq(verificationRequest.caseId, id))
      .orderBy(verificationRequest.createdAt),
    db().select().from(fact).where(eq(fact.caseId, id)).orderBy(desc(fact.createdAt)),
  ]);
  const factIds = facts.map((f) => f.id);
  const alerts = factIds.length
    ? await db()
        .select({ id: alert.id, status: alert.status, name: person.displayName, last4: person.phoneLast4, isDemo: person.isDemo, refId: alert.refId })
        .from(alert)
        .innerJoin(person, eq(person.id, alert.personId))
        .where(and(eq(alert.kind, "case"), inArray(alert.refId, factIds)))
    : [];
  return { ...c, reports, requests, facts, alerts };
}

export async function listUnits() {
  const units = await db()
    .select({
      id: pollingUnit.id,
      code: pollingUnit.code,
      name: pollingUnit.name,
      address: pollingUnit.address,
      landmark: pollingUnit.landmark,
      lat: pollingUnit.lat,
      lng: pollingUnit.lng,
      status: pollingUnit.status,
      relocatedToId: pollingUnit.relocatedToId,
      ward: ward.name,
      wardId: ward.id,
      subscribers: sql<number>`(select count(*)::int from subscription s where s.pu_id = ${pollingUnit.id} and s.active and s.kind = 'voter')`,
      needs: sql<number>`(select count(*)::int from subscription s where s.pu_id = ${pollingUnit.id} and s.active and cardinality(s.needs) > 0)`,
      realSubscribers: sql<number>`(select count(*)::int from subscription s join person p on p.id = s.person_id where s.pu_id = ${pollingUnit.id} and s.active and s.kind = 'voter' and not p.is_demo and p.deleted_at is null)`,
      officials: sql<number>`(select count(*)::int from role r where r.pu_id = ${pollingUnit.id} and r.kind = 'official')`,
    })
    .from(pollingUnit)
    .innerJoin(ward, eq(ward.id, pollingUnit.wardId))
    .orderBy(pollingUnit.code);
  const latest = await db().execute<{ pu_id: string; event: string; at: Date; eta_minutes: number | null; note: string | null }>(sql`
    select distinct on (pu_id) pu_id, event, at, eta_minutes, note from checkin
    where at > now() - interval '18 hours' order by pu_id, at desc`);
  const byPu = new Map(latest.rows.map((r) => [r.pu_id, r]));
  return units.map((u) => {
    const l = byPu.get(u.id);
    return { ...u, latest: l ? { event: l.event, at: new Date(l.at), eta: l.eta_minutes, note: l.note } : null };
  });
}
export type UnitRow = Awaited<ReturnType<typeof listUnits>>[number];

export async function listNotices() {
  return db()
    .select({ id: notice.id, body: notice.body, createdAt: notice.createdAt, createdBy: notice.createdBy, pu: pollingUnit.name })
    .from(notice)
    .innerJoin(pollingUnit, eq(pollingUnit.id, notice.puId))
    .orderBy(desc(notice.createdAt))
    .limit(20);
}

export async function listWardsAndUnits() {
  const [wards, units] = await Promise.all([
    db().select({ id: ward.id, name: ward.name }).from(ward).orderBy(ward.code),
    db().select({ id: pollingUnit.id, name: pollingUnit.name, code: pollingUnit.code, wardId: pollingUnit.wardId, status: pollingUnit.status }).from(pollingUnit).orderBy(pollingUnit.code),
  ]);
  return { wards, units };
}

export async function listCalls() {
  const [calls, attempts] = await Promise.all([
    db()
      .select({
        id: call.id,
        aethexCallId: call.aethexCallId,
        agent: call.agent,
        direction: call.direction,
        purpose: call.purpose,
        status: call.status,
        durationS: call.durationS,
        costCents: call.costCents,
        transcript: call.transcript,
        transcriptText: call.transcriptText,
        createdAt: call.createdAt,
        name: person.displayName,
        last4: person.phoneLast4,
      })
      .from(call)
      .leftJoin(person, eq(person.id, call.personId))
      .orderBy(desc(call.createdAt))
      .limit(60),
    db()
      .select({ id: outboundAttempt.id, at: outboundAttempt.at, purpose: outboundAttempt.purpose, decision: outboundAttempt.decision, error: outboundAttempt.error, name: person.displayName, last4: person.phoneLast4, isDemo: person.isDemo })
      .from(outboundAttempt)
      .leftJoin(person, eq(person.id, outboundAttempt.personId))
      .orderBy(desc(outboundAttempt.at))
      .limit(80),
  ]);
  return { calls, attempts };
}
export type CallRow = Awaited<ReturnType<typeof listCalls>>["calls"][number];

export async function listVoters() {
  const rows = await db()
    .select({
      personId: person.id,
      subId: subscription.id,
      name: person.displayName,
      last4: person.phoneLast4,
      needs: subscription.needs,
      puId: pollingUnit.id,
      pu: pollingUnit.name,
      puCode: pollingUnit.code,
      puStatus: pollingUnit.status,
      createdAt: subscription.createdAt,
      lastAlert: sql<string | null>`(select a.status || '|' || a.kind || '|' || to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') from alert a where a.person_id = ${person.id} order by a.created_at desc limit 1)`,
    })
    .from(subscription)
    .innerJoin(person, eq(person.id, subscription.personId))
    .innerJoin(pollingUnit, eq(pollingUnit.id, subscription.puId))
    .where(and(eq(subscription.active, true), eq(subscription.kind, "voter"), isNull(person.deletedAt)))
    .orderBy(person.displayName);
  return rows.map((r) => {
    const [status, kind, at] = (r.lastAlert ?? "").split("|");
    return { ...r, lastAlert: r.lastAlert ? { status: status!, kind: kind!, at: new Date(at!) } : null };
  });
}
export type VoterRow = Awaited<ReturnType<typeof listVoters>>[number];

export async function listAssistanceRequests() {
  return db()
    .select({ id: subscription.id, name: person.displayName, last4: person.phoneLast4, needs: subscription.needs, pu: pollingUnit.name, createdAt: subscription.createdAt, goNowSentAt: subscription.goNowSentAt })
    .from(subscription)
    .innerJoin(person, eq(person.id, subscription.personId))
    .innerJoin(pollingUnit, eq(pollingUnit.id, subscription.puId))
    .where(and(eq(subscription.active, true), sql`cardinality(${subscription.needs}) > 0`, isNull(person.deletedAt)))
    .orderBy(desc(subscription.createdAt));
}

export async function listOfficials() {
  const rows = await db()
    .select({
      roleId: role.id,
      personId: person.id,
      name: person.displayName,
      last4: person.phoneLast4,
      kind: role.kind,
      puId: role.puId,
      pu: pollingUnit.name,
      puCode: pollingUnit.code,
      ward: ward.name,
      hasPin: sql<boolean>`${role.pinHash} is not null`,
      locked: sql<boolean>`${role.pinLockedUntil} is not null and ${role.pinLockedUntil} > now()`,
    })
    .from(role)
    .innerJoin(person, eq(person.id, role.personId))
    .innerJoin(ward, eq(ward.id, role.wardId))
    .leftJoin(pollingUnit, eq(pollingUnit.id, role.puId))
    .where(and(inArray(role.kind, ["official", "supervisor"]), isNull(person.deletedAt)))
    .orderBy(role.kind, pollingUnit.code);
  const latest = await db().execute<{ pu_id: string; event: string; at: Date; eta_minutes: number | null }>(sql`
    select distinct on (pu_id) pu_id, event, at, eta_minutes from checkin where at > now() - interval '18 hours' order by pu_id, at desc`);
  const byPu = new Map(latest.rows.map((r) => [r.pu_id, r]));
  return rows.map((r) => {
    const l = r.puId ? byPu.get(r.puId) : undefined;
    return { ...r, latest: l ? { event: l.event, at: new Date(l.at), eta: l.eta_minutes } : null };
  });
}
export type OfficialRow = Awaited<ReturnType<typeof listOfficials>>[number];

/** Everything Confam currently "knows" and will answer instantly, with when each answer stops being reused. */
export async function getSituation() {
  const [facts, open, checkins] = await Promise.all([
    db()
      .select({ id: fact.id, caseId: fact.caseId, category: fact.category, claim: fact.claimEn, verdict: fact.verdict, validUntil: fact.validUntil, createdAt: fact.createdAt, scriptEn: fact.scriptEn, pu: pollingUnit.name, ward: ward.name })
      .from(fact)
      .leftJoin(pollingUnit, eq(pollingUnit.id, fact.puId))
      .leftJoin(ward, eq(ward.id, fact.wardId))
      .where(and(isNull(fact.supersededAt), sql`${fact.validUntil} > now()`))
      .orderBy(desc(fact.createdAt)),
    listCases("verifying"),
    db().execute<{ pu_id: string; name: string; code: string; event: string; at: Date; eta_minutes: number | null; note: string | null }>(sql`
      select distinct on (c.pu_id) c.pu_id, pu.name, pu.code, c.event, c.at, c.eta_minutes, c.note
      from checkin c join polling_unit pu on pu.id = c.pu_id
      where c.at > now() - interval '18 hours' order by c.pu_id, c.at desc`),
  ]);
  return { facts, open, checkins: checkins.rows.map((r) => ({ ...r, at: new Date(r.at) })) };
}
