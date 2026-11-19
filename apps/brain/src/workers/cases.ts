import { and, eq, isNull, ne, sql } from "drizzle-orm";
import {
  alert,
  claimCase,
  fact,
  notify,
  pollingUnit,
  QUEUES,
  report,
  role,
  subscription,
  systemSettings,
  verificationRequest,
  ward,
  person,
  type AlertCaseJob,
  type CaseAggregateJob,
  type CaseVerifyJob,
  type DialJob,
} from "@confam/db";
import type { AppDeps } from "../context.ts";
import { decideVerdict, type VerifierAnswer } from "../domain/verdict.ts";
import { correctionPrefix, placeName, SAFETY_CATEGORIES, verdictScript, type Category } from "../domain/scripts.ts";

const MAX_VERIFIERS = 5;

async function placeLabel(deps: AppDeps, wardId: string | null, puId: string | null): Promise<string> {
  if (puId) {
    const [pu] = await deps.db.select({ name: pollingUnit.name }).from(pollingUnit).where(eq(pollingUnit.id, puId));
    if (pu) return pu.name;
  }
  if (wardId) {
    const [w] = await deps.db.select({ name: ward.name }).from(ward).where(eq(ward.id, wardId));
    if (w) return `${placeName(w.name)} ward`;
  }
  return "Surulere";
}

/** Order candidates by reputation, then interleave affiliations so one group can't dominate. */
export function pickVerifiers<T extends { personId: string; affiliation: string | null; reputation: number }>(cands: T[], max: number): T[] {
  const byPerson = new Map<string, T>();
  for (const c of [...cands].sort((a, b) => b.reputation - a.reputation)) if (!byPerson.has(c.personId)) byPerson.set(c.personId, c);
  const groups = new Map<string, T[]>();
  for (const c of byPerson.values()) {
    const k = c.affiliation ?? "none";
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const out: T[] = [];
  const queues = [...groups.values()];
  while (out.length < max && queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift();
      if (next) out.push(next);
      if (out.length >= max) break;
    }
  }
  return out;
}

export async function handleCaseVerify(deps: AppDeps, job: CaseVerifyJob): Promise<void> {
  const [c] = await deps.db.select().from(claimCase).where(eq(claimCase.id, job.caseId));
  if (!c || c.status !== "verifying" || !c.wardId) return;

  const reporters = await deps.db.select({ personId: report.personId }).from(report).where(eq(report.caseId, c.id));
  const exclude = new Set(reporters.map((r) => r.personId).filter(Boolean) as string[]);

  const load = async (wardOnly: boolean) =>
    deps.db
      .select({ roleId: role.id, personId: role.personId, affiliation: role.affiliation, reputation: role.reputation, wardId: role.wardId })
      .from(role)
      .innerJoin(person, eq(person.id, role.personId))
      .where(and(eq(role.kind, "verifier"), isNull(person.deletedAt), wardOnly ? eq(role.wardId, c.wardId!) : ne(role.wardId, c.wardId!)));

  const local = (await load(true)).filter((v) => !exclude.has(v.personId));
  let chosen = pickVerifiers(local, MAX_VERIFIERS);
  if (chosen.length < 2) {
    const wider = (await load(false)).filter((v) => !exclude.has(v.personId) && !chosen.some((x) => x.personId === v.personId));
    chosen = [...chosen, ...pickVerifiers(wider, MAX_VERIFIERS - chosen.length)];
  }

  for (const v of chosen) {
    const [row] = await deps.db
      .insert(verificationRequest)
      .values({ caseId: c.id, personId: v.personId, roleId: v.roleId, weight: v.reputation, affiliation: v.affiliation })
      .onConflictDoNothing()
      .returning({ id: verificationRequest.id });
    if (!row) continue;
    const dialJob: DialJob = { purpose: "verify", personId: v.personId, refId: c.id, rowId: row.id, attempt: 1 };
    await deps.jobs.send(QUEUES.dial, dialJob, { retryLimit: 3, retryDelay: 20, retryBackoff: true });
  }
  await notify(deps.pool, { type: "case", id: c.id });
  deps.log.info({ caseId: c.id, verifiers: chosen.length }, "verification started");
  if (chosen.length === 0) await deps.jobs.send(QUEUES.caseAggregate, { caseId: c.id, reason: "answer" } satisfies CaseAggregateJob);
}

/**
 * Applies the verdict rule. Runs after every answer, when calls end, and at the deadline.
 * Row-locks the case so concurrent runs can't publish twice.
 */
export async function handleCaseAggregate(deps: AppDeps, job: CaseAggregateJob): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const published = await deps.db.transaction(async (tx) => {
    const locked = await tx.execute<{ id: string }>(sql`select id from claim_case where id = ${job.caseId} for update`);
    if (locked.rows.length === 0) return null;
    const [c] = await tx.select().from(claimCase).where(eq(claimCase.id, job.caseId));
    if (!c || c.status === "published") return null;

    const [settings] = await tx.select().from(systemSettings).limit(1);
    const reqs = await tx.select().from(verificationRequest).where(eq(verificationRequest.caseId, c.id));
    const answers: VerifierAnswer[] = reqs
      .filter((r) => r.status === "answered" && r.answer)
      .map((r) => ({ personId: r.personId, answer: r.answer!, weight: r.weight, affiliation: r.affiliation }));
    const allDone = reqs.every((r) => ["answered", "no_answer", "skipped", "failed"].includes(r.status));
    const deadlinePassed = now >= c.deadlineAt || allDone;
    const result = decideVerdict(answers, deadlinePassed, {
      minAnswers: settings?.verdictMinAnswers ?? 2,
      threshold: settings?.verdictThreshold ?? 0.7,
      maxPerAffiliation: 2,
    });
    if (!result.final || !result.verdict) return null;

    const label = await placeLabel(deps, c.wardId, c.puId);
    const script = verdictScript({ verdict: result.verdict, category: c.category as Category, claimEn: c.claimEn, place: label, yes: result.yes, no: result.no });
    const basis =
      result.verdict === "unverified"
        ? `Not enough agreement by the deadline (yes ${result.yes}, no ${result.no}, unknown ${result.unknown}, ${reqs.length} verifiers asked).`
        : `${result.verdict === "confirmed" ? result.yes : result.no} independent verifiers agreed (yes ${result.yes}, no ${result.no}, unknown ${result.unknown}).`;

    await tx
      .update(claimCase)
      .set({ status: "published", verdict: result.verdict, confidence: result.confidence, basis, publishedAt: now })
      .where(eq(claimCase.id, c.id));
    const validHours = result.verdict === "unverified" ? 1 : (settings?.factValidHours ?? 3);
    const [f] = await tx
      .insert(fact)
      .values({
        caseId: c.id,
        category: c.category,
        claimEn: c.claimEn,
        verdict: result.verdict,
        scriptEn: script.en,
        scriptPcm: script.pcm,
        wardId: c.wardId,
        puId: c.puId,
        validUntil: new Date(now.getTime() + validHours * 3600_000),
      })
      .returning({ id: fact.id });
    return { caseId: c.id, factId: f!.id, verdict: result.verdict };
  });

  if (published) {
    deps.log.info(published, "verdict published");
    await notify(deps.pool, { type: "case", id: published.caseId });
    await deps.jobs.send(QUEUES.alertCase, { caseId: published.caseId } satisfies AlertCaseJob, { singletonKey: `alert:${published.factId}` });
  }
}

/** Calls back every reporter, plus area subscribers for safety categories (unless unverified). */
export async function handleAlertCase(deps: AppDeps, job: AlertCaseJob): Promise<void> {
  const [c] = await deps.db.select().from(claimCase).where(eq(claimCase.id, job.caseId));
  if (!c || c.status !== "published" || !c.verdict) return;
  const [f] = await deps.db
    .select()
    .from(fact)
    .where(and(eq(fact.caseId, c.id), isNull(fact.supersededAt)))
    .orderBy(sql`${fact.createdAt} desc`)
    .limit(1);
  if (!f) return;

  const recipients = new Set<string>();
  const reporters = await deps.db.select({ personId: report.personId }).from(report).where(eq(report.caseId, c.id));
  for (const r of reporters) if (r.personId) recipients.add(r.personId);

  if (SAFETY_CATEGORIES.has(c.category as Category) && c.verdict !== "unverified" && c.wardId) {
    const subs = await deps.db
      .select({ personId: subscription.personId })
      .from(subscription)
      .innerJoin(pollingUnit, eq(pollingUnit.id, subscription.puId))
      .where(and(eq(subscription.active, true), eq(pollingUnit.wardId, c.wardId)));
    for (const s of subs) recipients.add(s.personId);
  }

  const script = job.correction ? correctionPrefix({ en: f.scriptEn, pcm: f.scriptPcm }) : { en: f.scriptEn, pcm: f.scriptPcm };
  const ids = [...recipients];
  if (ids.length === 0) return;
  const rows = await deps.db
    .insert(alert)
    .values(ids.map((personId) => ({ kind: "case" as const, refId: f.id, personId, scriptEn: script.en, scriptPcm: script.pcm })))
    .onConflictDoNothing()
    .returning({ id: alert.id, personId: alert.personId });
  for (const r of rows) {
    await deps.jobs.send(QUEUES.dial, { purpose: "case_alert", personId: r.personId, refId: f.id, rowId: r.id, attempt: 1 } satisfies DialJob, {
      retryLimit: 3,
      retryDelay: 20,
      retryBackoff: true,
    });
  }
  deps.log.info({ caseId: c.id, factId: f.id, alerts: rows.length }, "case alerts queued");
}

/** Control-room override: replace the verdict, supersede the old fact, adjust reputations, send corrections. */
export async function overrideVerdict(
  deps: AppDeps,
  input: { caseId: string; verdict: "confirmed" | "false" | "unverified"; by: string },
): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const factId = await deps.db.transaction(async (tx) => {
    const [c] = await tx.select().from(claimCase).where(eq(claimCase.id, input.caseId));
    if (!c) throw new Error("case not found");
    const reqs = await tx.select().from(verificationRequest).where(and(eq(verificationRequest.caseId, c.id), eq(verificationRequest.status, "answered")));
    const yes = reqs.filter((r) => r.answer === "yes").length;
    const no = reqs.filter((r) => r.answer === "no").length;
    const label = await placeLabel(deps, c.wardId, c.puId);
    const script = verdictScript({ verdict: input.verdict, category: c.category as Category, claimEn: c.claimEn, place: label, yes: Math.max(yes, 2), no: Math.max(no, 2) });
    await tx.update(fact).set({ supersededAt: now }).where(and(eq(fact.caseId, c.id), isNull(fact.supersededAt)));
    await tx
      .update(claimCase)
      .set({ status: "published", verdict: input.verdict, publishedAt: now, overriddenBy: input.by, basis: `Set by INEC control room (${input.by}).` })
      .where(eq(claimCase.id, c.id));
    const [settings] = await tx.select().from(systemSettings).limit(1);
    const [f] = await tx
      .insert(fact)
      .values({
        caseId: c.id,
        category: c.category,
        claimEn: c.claimEn,
        verdict: input.verdict,
        scriptEn: script.en,
        scriptPcm: script.pcm,
        wardId: c.wardId,
        puId: c.puId,
        validUntil: new Date(now.getTime() + (settings?.factValidHours ?? 3) * 3600_000),
      })
      .returning({ id: fact.id });
    if (input.verdict !== "unverified") {
      const truth = input.verdict === "confirmed" ? "yes" : "no";
      for (const r of reqs) {
        if (r.answer === "unknown") continue;
        await tx
          .update(role)
          .set({ reputation: sql`least(2, greatest(0.2, ${role.reputation} + ${r.answer === truth ? 0.1 : -0.2}))` })
          .where(eq(role.id, r.roleId));
      }
    }
    return f!.id;
  });
  await notify(deps.pool, { type: "case", id: input.caseId });
  await deps.jobs.send(QUEUES.alertCase, { caseId: input.caseId, correction: true } satisfies AlertCaseJob, { singletonKey: `alert:${factId}` });
}

