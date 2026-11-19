import { and, eq, gte } from "drizzle-orm";
import {
  alert,
  call,
  isDemoNumber,
  normalizePhone,
  notify,
  outboundAttempt,
  person,
  systemSettings,
  verificationRequest,
  type DialJob,
} from "@confam/db";
import { AethexError } from "./aethex/client.ts";
import type { AppDeps } from "./context.ts";
import { inWindow } from "./time.ts";

export type Decision =
  | "dialled"
  | "skipped_paused"
  | "skipped_demo_contact"
  | "skipped_not_allowlisted"
  | "skipped_cooldown"
  | "skipped_quiet_hours"
  | "skipped_no_phone"
  | "error";

export interface DialRequest extends DialJob {
  dynamicVariables: Record<string, string | number | boolean>;
}

const AGENT_FOR: Record<DialJob["purpose"], "verifier" | "alert" | "official"> = {
  verify: "verifier",
  case_alert: "alert",
  notice_alert: "alert",
  go_now: "alert",
  late_official: "official",
  late_supervisor: "official",
};

/** Purposes that are not urgent and so respect quiet hours outside election day. */
const QUIET_HOURS_PURPOSES = new Set<DialJob["purpose"]>(["go_now"]); // INEC-issued notices are deliberate and go out immediately
const COOLDOWN_MS = 2 * 60_000;

export interface DialOutcome {
  decision: Decision;
  aethexCallId?: string;
  error?: string;
  /** true when the caller should retry later (transient Aethex failure) */
  retryable?: boolean;
}

/**
 * The single code path that places outbound calls. Every decision (including skips) is recorded
 * in outbound_attempt so the control room can see exactly why a call did or did not happen.
 */
export async function dial(deps: AppDeps, req: DialRequest): Promise<DialOutcome> {
  const now = deps.now?.() ?? new Date();
  const record = async (decision: Decision, extra: { aethexCallId?: string; error?: string } = {}) => {
    const [row] = await deps.db
      .insert(outboundAttempt)
      .values({ personId: req.personId, purpose: req.purpose, refId: req.refId, decision, aethexCallId: extra.aethexCallId ?? null, error: extra.error ?? null, at: now })
      .returning({ id: outboundAttempt.id });
    await notify(deps.pool, { type: "outbound", id: row!.id });
  };
  const markRow = async (status: "calling" | "skipped" | "failed", aethexCallId?: string) => {
    const set = { status, ...(aethexCallId ? { aethexCallId } : {}) } as const;
    if (req.purpose === "verify") {
      await deps.db.update(verificationRequest).set({ ...set, attempts: req.attempt }).where(eq(verificationRequest.id, req.rowId));
    } else if (req.purpose === "case_alert" || req.purpose === "notice_alert" || req.purpose === "go_now") {
      await deps.db.update(alert).set({ ...set, attempts: req.attempt }).where(eq(alert.id, req.rowId));
    }
  };
  const skip = async (decision: Decision, error?: string): Promise<DialOutcome> => {
    await record(decision, { error });
    await markRow(decision === "error" ? "failed" : "skipped");
    return { decision, error };
  };

  const [settings] = await deps.db.select().from(systemSettings).limit(1);
  if (settings?.outboundPaused) return skip("skipped_paused");

  const [p] = await deps.db.select().from(person).where(eq(person.id, req.personId)).limit(1);
  if (!p || p.deletedAt) return skip("skipped_no_phone");
  let e164: string;
  try {
    e164 = normalizePhone(deps.crypto.decrypt(p.phoneEnc));
  } catch {
    return skip("skipped_no_phone");
  }
  if (p.isDemo || isDemoNumber(e164)) return skip("skipped_demo_contact");
  if (QUIET_HOURS_PURPOSES.has(req.purpose) && !settings?.electionDay && settings && inWindow(now, deps.config.ELECTION_TZ, settings.quietStart, settings.quietEnd)) {
    return skip("skipped_quiet_hours");
  }
  const recent = await deps.db
    .select({ id: outboundAttempt.id })
    .from(outboundAttempt)
    .where(
      and(
        eq(outboundAttempt.personId, p.id),
        eq(outboundAttempt.purpose, req.purpose),
        eq(outboundAttempt.refId, req.refId),
        eq(outboundAttempt.decision, "dialled"),
        gte(outboundAttempt.at, new Date(now.getTime() - COOLDOWN_MS)),
      ),
    )
    .limit(1);
  if (recent.length > 0 && req.attempt <= 1) return skip("skipped_cooldown");

  const agentKey = AGENT_FOR[req.purpose];
  const agentId = deps.config.AETHEX_AGENT_IDS[agentKey];
  if (!agentId) return skip("error", `no Aethex agent configured for ${agentKey}`);

  try {
    const res = await deps.aethex.triggerCall({
      agentId,
      toNumber: e164,
      fromNumber: deps.config.CONFAM_LINE_NUMBER,
      dynamicVariables: req.dynamicVariables,
      metadata: { purpose: req.purpose, ref_id: req.refId, row_id: req.rowId, person_id: p.id },
    });
    const aethexCallId = String(res.id);
    await deps.db
      .insert(call)
      .values({ aethexCallId, agent: agentKey, direction: "outbound", personId: p.id, purpose: req.purpose, refId: req.refId, status: res.status ?? "queued" })
      .onConflictDoNothing();
    await markRow("calling", aethexCallId);
    await record("dialled", { aethexCallId });
    return { decision: "dialled", aethexCallId };
  } catch (err) {
    const message = err instanceof AethexError ? `${err.status} ${err.code ?? ""} ${err.message}`.trim() : (err as Error).message;
    const retryable = err instanceof AethexError ? err.retryable : true;
    await record("error", { error: message.slice(0, 500) });
    if (!retryable) await markRow("failed");
    deps.log.warn({ purpose: req.purpose, refId: req.refId, err: message }, "outbound call failed");
    return { decision: "error", error: message, retryable };
  }
}
