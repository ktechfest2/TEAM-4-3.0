import { and, eq, isNull, sql } from "drizzle-orm";
import {
  alert,
  notice,
  pollingUnit,
  QUEUES,
  subscription,
  type AlertGoNowJob,
  type AlertNoticeJob,
  type DialJob,
} from "@confam/db";
import type { AppDeps } from "../context.ts";
import { goNowScript, relocationScript } from "../domain/scripts.ts";

const DIAL_OPTS = { retryLimit: 3, retryDelay: 20, retryBackoff: true } as const;

export async function handleAlertNotice(deps: AppDeps, job: AlertNoticeJob): Promise<void> {
  const [n] = await deps.db.select().from(notice).where(eq(notice.id, job.noticeId));
  if (!n || n.kind !== "relocation" || !n.newPuId) return;
  const [oldPu] = await deps.db.select().from(pollingUnit).where(eq(pollingUnit.id, n.puId));
  const [newPu] = await deps.db.select().from(pollingUnit).where(eq(pollingUnit.id, n.newPuId));
  if (!oldPu || !newPu) return;
  const script = relocationScript({ oldPu: oldPu.name, newPu: newPu.name, newAddress: newPu.address, landmark: newPu.landmark });
  const subs = await deps.db
    .select({ personId: subscription.personId })
    .from(subscription)
    .where(and(eq(subscription.puId, n.puId), eq(subscription.active, true)));
  if (subs.length === 0) return;
  const rows = await deps.db
    .insert(alert)
    .values(subs.map((s) => ({ kind: "notice" as const, refId: n.id, personId: s.personId, scriptEn: script.en, scriptPcm: script.pcm })))
    .onConflictDoNothing()
    .returning({ id: alert.id, personId: alert.personId });
  for (const r of rows) {
    await deps.jobs.send(QUEUES.dial, { purpose: "notice_alert", personId: r.personId, refId: n.id, rowId: r.id, attempt: 1 } satisfies DialJob, DIAL_OPTS);
  }
  deps.log.info({ noticeId: n.id, alerts: rows.length }, "relocation alerts queued");
}

/** After officials arrive, call voters with accessibility needs at that PU (once each). */
export async function handleAlertGoNow(deps: AppDeps, job: AlertGoNowJob): Promise<void> {
  const [pu] = await deps.db.select().from(pollingUnit).where(eq(pollingUnit.id, job.puId));
  if (!pu) return;
  const subs = await deps.db
    .update(subscription)
    .set({ goNowSentAt: new Date() })
    .where(and(eq(subscription.puId, pu.id), eq(subscription.active, true), isNull(subscription.goNowSentAt), sql`cardinality(${subscription.needs}) > 0`))
    .returning({ personId: subscription.personId });
  if (subs.length === 0) return;
  const script = goNowScript({ pu: pu.name });
  const rows = await deps.db
    .insert(alert)
    .values(subs.map((s) => ({ kind: "go_now" as const, refId: pu.id, personId: s.personId, scriptEn: script.en, scriptPcm: script.pcm })))
    .onConflictDoNothing()
    .returning({ id: alert.id, personId: alert.personId });
  for (const r of rows) {
    await deps.jobs.send(QUEUES.dial, { purpose: "go_now", personId: r.personId, refId: pu.id, rowId: r.id, attempt: 1 } satisfies DialJob, DIAL_OPTS);
  }
  deps.log.info({ puId: pu.id, alerts: rows.length }, "go-now alerts queued");
}
