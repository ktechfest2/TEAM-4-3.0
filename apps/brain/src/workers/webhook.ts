import { eq } from "drizzle-orm";
import { z } from "zod";
import { alert, call, notify, QUEUES, verificationRequest, type DialJob, type WebhookJob } from "@confam/db";
import type { AppDeps } from "../context.ts";
import { findPersonByPhone } from "../people.ts";

const CallEnded = z.object({
  call_id: z.string(),
  agent_id: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  direction: z.string().optional().nullable(),
  from_number: z.string().optional().nullable(),
  to_number: z.string().optional().nullable(),
  duration_seconds: z.number().optional().nullable(),
  cost_cents: z.number().optional().nullable(),
  started_at: z.union([z.string(), z.number()]).optional().nullable(),
  ended_at: z.union([z.string(), z.number()]).optional().nullable(),
  transcript: z.unknown().optional(),
  transcript_text: z.string().optional().nullable(),
});

const RETRY_DELAY_S = 180;
const MAX_ATTEMPTS = 2;

function toDate(v: string | number | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function handleWebhook(deps: AppDeps, job: WebhookJob): Promise<void> {
  if (job.type !== "call.ended") {
    deps.log.debug({ type: job.type }, "ignoring webhook event");
    return;
  }
  const parsed = CallEnded.safeParse(job.payload);
  if (!parsed.success) {
    deps.log.warn({ eventId: job.eventId, issues: parsed.error.issues }, "malformed call.ended payload");
    return;
  }
  const e = parsed.data;
  const agentKey = Object.entries(deps.config.AETHEX_AGENT_IDS).find(([, v]) => v && v === e.agent_id)?.[0] ?? null;
  const direction: "inbound" | "outbound" | null = e.direction === "inbound" || e.direction === "outbound" ? e.direction : null;
  const otherParty = direction === "outbound" ? e.to_number : e.from_number;
  const who = otherParty ? await findPersonByPhone(deps.db, deps.crypto, otherParty) : null;
  const completed = e.status === "completed";

  const values = {
    aethexCallId: e.call_id,
    agent: agentKey,
    direction,
    personId: who?.id ?? null,
    status: e.status ?? null,
    durationS: e.duration_seconds != null ? Math.round(e.duration_seconds) : null,
    costCents: e.cost_cents != null ? Math.round(e.cost_cents) : null,
    transcript: e.transcript ?? null,
    transcriptText: e.transcript_text ?? null,
    startedAt: toDate(e.started_at),
    endedAt: toDate(e.ended_at),
  };
  const [row] = await deps.db
    .insert(call)
    .values(values)
    .onConflictDoUpdate({
      target: call.aethexCallId,
      set: { status: values.status, durationS: values.durationS, costCents: values.costCents, transcript: values.transcript, transcriptText: values.transcriptText, startedAt: values.startedAt, endedAt: values.endedAt, ...(who ? { personId: who.id } : {}), ...(agentKey ? { agent: agentKey } : {}) },
    })
    .returning({ id: call.id });
  await notify(deps.pool, { type: "call", id: row!.id });

  // Verification calls that ended without a recorded answer: retry once, then mark no_answer and re-aggregate.
  const [vr] = await deps.db.select().from(verificationRequest).where(eq(verificationRequest.aethexCallId, e.call_id));
  if (vr && vr.status === "calling") {
    if (vr.attempts < MAX_ATTEMPTS && !completed) {
      await deps.db.update(verificationRequest).set({ status: "pending" }).where(eq(verificationRequest.id, vr.id));
      await deps.jobs.send(QUEUES.dial, { purpose: "verify", personId: vr.personId, refId: vr.caseId, rowId: vr.id, attempt: vr.attempts + 1 } satisfies DialJob, { startAfter: RETRY_DELAY_S });
    } else {
      await deps.db.update(verificationRequest).set({ status: "no_answer" }).where(eq(verificationRequest.id, vr.id));
      await deps.jobs.send(QUEUES.caseAggregate, { caseId: vr.caseId, reason: "answer" });
    }
    await notify(deps.pool, { type: "case", id: vr.caseId });
  }

  const alerts = await deps.db.select().from(alert).where(eq(alert.aethexCallId, e.call_id));
  for (const a of alerts) {
    if (a.status !== "calling") continue;
    if (completed) {
      await deps.db.update(alert).set({ status: "delivered" }).where(eq(alert.id, a.id));
    } else if (a.attempts < MAX_ATTEMPTS) {
      await deps.db.update(alert).set({ status: "pending" }).where(eq(alert.id, a.id));
      const purpose = a.kind === "case" ? "case_alert" : a.kind === "notice" ? "notice_alert" : "go_now";
      await deps.jobs.send(QUEUES.dial, { purpose, personId: a.personId, refId: a.refId, rowId: a.id, attempt: a.attempts + 1 } satisfies DialJob, { startAfter: RETRY_DELAY_S });
    } else {
      await deps.db.update(alert).set({ status: "no_answer" }).where(eq(alert.id, a.id));
    }
    await notify(deps.pool, { type: "alert", id: a.id });
  }
}
