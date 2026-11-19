import { and, desc, eq } from "drizzle-orm";
import { alert, checkin, claimCase, person, pollingUnit, role, verificationRequest, ward, type DialJob } from "@confam/db";
import type { AppDeps } from "../context.ts";
import { dial, type DialOutcome } from "../dialer.ts";
import { placeName, verifierQuestion } from "../domain/scripts.ts";

const HUMAN_EVENT: Record<string, string> = {
  arrived: "officials arrived",
  materials_received: "materials arrived",
  voting_started: "voting started",
  delay: "delay reported",
  issue: "problem reported",
  closed: "voting closed",
};

async function puLabel(deps: AppDeps, puId: string | null, wardId: string | null): Promise<string> {
  if (puId) {
    const [pu] = await deps.db.select({ name: pollingUnit.name }).from(pollingUnit).where(eq(pollingUnit.id, puId));
    if (pu) return pu.name;
  }
  if (wardId) {
    const [w] = await deps.db.select({ name: ward.name }).from(ward).where(eq(ward.id, wardId));
    if (w) return `${placeName(w.name)} ward`;
  }
  return "your area";
}

/** Builds per-call variables from fresh DB state, then hands off to the dialer. Returns early if the call is no longer needed. */
export async function handleDial(deps: AppDeps, job: DialJob): Promise<DialOutcome | { decision: "not_needed" }> {
  const [p] = await deps.db.select({ name: person.displayName, lang: person.languagePref }).from(person).where(eq(person.id, job.personId));
  const name = p && !p.name.startsWith("Caller ") ? p.name : "";
  let vars: Record<string, string | number | boolean> = { person_name: name, language_pref: p?.lang ?? "" };

  if (job.purpose === "verify") {
    const [vr] = await deps.db.select().from(verificationRequest).where(eq(verificationRequest.id, job.rowId));
    if (!vr || vr.status === "answered") return { decision: "not_needed" };
    const [c] = await deps.db.select().from(claimCase).where(eq(claimCase.id, vr.caseId));
    if (!c || c.status !== "verifying") return { decision: "not_needed" };
    const place = await puLabel(deps, c.puId, c.wardId);
    const [r] = vr.roleId
      ? await deps.db.select({ kind: role.kind, pu: pollingUnit.name }).from(role).leftJoin(pollingUnit, eq(pollingUnit.id, role.puId)).where(eq(role.id, vr.roleId))
      : [];
    const verifierRole = r?.kind === "official" ? `the presiding officer at ${r.pu ?? place}` : "a trusted community verifier";
    const claimText = c.claimEn.trim().replace(/[.\s]+$/, "");
    vars = {
      ...vars,
      verifier_name: name || "the presiding officer",
      verifier_role: verifierRole,
      case_question: verifierQuestion({ claimEn: c.claimEn, place }),
      claim_text: claimText.charAt(0).toLowerCase() + claimText.slice(1),
      location_name: place,
    };
  } else if (job.purpose === "case_alert" || job.purpose === "notice_alert" || job.purpose === "go_now") {
    const [a] = await deps.db.select().from(alert).where(eq(alert.id, job.rowId));
    if (!a || a.status === "heard" || a.status === "delivered") return { decision: "not_needed" };
    vars = { ...vars, alert_script_en: a.scriptEn, alert_script_pcm: a.scriptPcm, alert_kind: a.kind };
  } else {
    // late_official / late_supervisor: refId is the polling unit
    const [pu] = await deps.db.select().from(pollingUnit).where(eq(pollingUnit.id, job.refId));
    if (!pu) return { decision: "not_needed" };
    const [latest] = await deps.db.select().from(checkin).where(eq(checkin.puId, pu.id)).orderBy(desc(checkin.at)).limit(1);
    const [po] = await deps.db
      .select({ name: person.displayName })
      .from(role)
      .innerJoin(person, eq(person.id, role.personId))
      .where(and(eq(role.puId, pu.id), eq(role.kind, "official")))
      .limit(1);
    vars = {
      ...vars,
      official_name: name,
      call_role: job.purpose === "late_official" ? "presiding officer" : "supervisor",
      polling_unit: pu.name,
      presiding_officer_name: po?.name ?? "the presiding officer",
      last_update: latest ? HUMAN_EVENT[latest.event] ?? latest.event : "no update yet today",
    };
  }
  return dial(deps, { ...job, dynamicVariables: vars });
}
