import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { checkin, outboundAttempt, pollingUnit, QUEUES, role, systemSettings, type DialJob } from "@confam/db";
import type { AppDeps } from "../context.ts";
import { hhmmToMinutes, localMinutes, startOfLocalDay } from "../time.ts";

const ESCALATE_AFTER_MS = 15 * 60_000;

/**
 * Election-day lateness sweep. For each PU with an assigned presiding officer and no "arrived"/"voting_started"
 * check-in today past the opening deadline: call the PO once; if still nothing 15 minutes later, call the ward supervisor(s).
 */
export async function handleSweepLateness(deps: AppDeps): Promise<{ poCalls: number; supervisorCalls: number }> {
  const now = deps.now?.() ?? new Date();
  const tz = deps.config.ELECTION_TZ;
  const [settings] = await deps.db.select().from(systemSettings).limit(1);
  if (!settings?.electionDay) return { poCalls: 0, supervisorCalls: 0 };
  if (localMinutes(now, tz) < hhmmToMinutes(settings.openingDeadline)) return { poCalls: 0, supervisorCalls: 0 };
  const dayStart = startOfLocalDay(now, tz);

  const officials = await deps.db
    .select({ roleId: role.id, personId: role.personId, puId: role.puId, wardId: role.wardId })
    .from(role)
    .where(and(eq(role.kind, "official"), sql`${role.puId} is not null`));
  if (officials.length === 0) return { poCalls: 0, supervisorCalls: 0 };
  const puIds = [...new Set(officials.map((o) => o.puId!))];

  const arrived = await deps.db
    .selectDistinct({ puId: checkin.puId })
    .from(checkin)
    .where(and(inArray(checkin.puId, puIds), inArray(checkin.event, ["arrived", "voting_started"]), gte(checkin.at, dayStart)));
  const arrivedSet = new Set(arrived.map((a) => a.puId));

  const attempts = await deps.db
    .select({ refId: outboundAttempt.refId, purpose: outboundAttempt.purpose, at: outboundAttempt.at })
    .from(outboundAttempt)
    .where(and(inArray(outboundAttempt.purpose, ["late_official", "late_supervisor"]), gte(outboundAttempt.at, dayStart)));

  let poCalls = 0;
  let supervisorCalls = 0;
  for (const puId of puIds) {
    if (arrivedSet.has(puId)) continue;
    const poAttempts = attempts.filter((a) => a.refId === puId && a.purpose === "late_official");
    const supAttempts = attempts.filter((a) => a.refId === puId && a.purpose === "late_supervisor");
    if (poAttempts.length === 0) {
      for (const o of officials.filter((x) => x.puId === puId)) {
        await deps.jobs.send(QUEUES.dial, { purpose: "late_official", personId: o.personId, refId: puId, rowId: o.roleId, attempt: 1 } satisfies DialJob, {
          singletonKey: `late:${puId}:${o.personId}:${dayStart.toISOString()}`,
        });
        poCalls++;
      }
      continue;
    }
    const firstPo = Math.min(...poAttempts.map((a) => a.at.getTime()));
    if (supAttempts.length === 0 && now.getTime() - firstPo >= ESCALATE_AFTER_MS) {
      const [pu] = await deps.db.select({ wardId: pollingUnit.wardId }).from(pollingUnit).where(eq(pollingUnit.id, puId));
      if (!pu) continue;
      const sups = await deps.db.select({ roleId: role.id, personId: role.personId }).from(role).where(and(eq(role.kind, "supervisor"), eq(role.wardId, pu.wardId)));
      for (const s of sups) {
        await deps.jobs.send(QUEUES.dial, { purpose: "late_supervisor", personId: s.personId, refId: puId, rowId: s.roleId, attempt: 1 } satisfies DialJob, {
          singletonKey: `latesup:${puId}:${s.personId}:${dayStart.toISOString()}`,
        });
        supervisorCalls++;
      }
    }
  }
  if (poCalls || supervisorCalls) deps.log.info({ poCalls, supervisorCalls }, "lateness sweep queued calls");
  return { poCalls, supervisorCalls };
}
