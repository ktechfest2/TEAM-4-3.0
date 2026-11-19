import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  alert,
  checkin,
  claimCase,
  notify,
  pollingUnit,
  QUEUES,
  report,
  role,
  subscription,
  systemSettings,
  verificationRequest,
  verifySecret,
  person,
} from "@confam/db";
import type { AppDeps } from "../context.ts";
import { findMatchingFact, findOpenCase } from "../domain/matching.ts";
import { resolvePlace, searchPollingUnits } from "../domain/places.ts";
import { CATEGORIES, placeName, type Category } from "../domain/scripts.ts";
import { ensurePerson, findPersonByPhone, type PersonRow } from "../people.ts";
import type { CallParty } from "./caller.ts";

export type AgentKey = "hotline" | "verifier" | "alert" | "official";

export interface ToolCall {
  agentKey: AgentKey;
  callId: string | null;
  conversationId: string | null;
  party: CallParty;
}

export interface ToolResult {
  say: string;
  [k: string]: unknown;
}

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  agents: AgentKey[];
  schema: S;
  handler(args: z.infer<S>, call: ToolCall, deps: AppDeps): Promise<ToolResult>;
}

const define = <S extends z.ZodType>(t: ToolDef<S>): ToolDef<S> => t;

const NEEDS = ["elderly", "mobility", "low_vision", "blind", "hearing", "other"] as const;
const LANGS = ["english", "pidgin", "yoruba", "hausa", "igbo"] as const;

function fmtTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: tz }).format(d);
}

async function caller(call: ToolCall, deps: AppDeps): Promise<PersonRow | null> {
  return call.party.phone ? findPersonByPhone(deps.db, deps.crypto, call.party.phone) : null;
}

const UNKNOWN_CALLER_SAY = "I can't see the caller's number on this line, so I can't save this. Ask them to call from their own phone.";

export const identifyCaller = define({
  name: "identify_caller",
  description:
    "Call this at the very start of every call. Returns who the caller is (if known): their name, roles (verifier, official, supervisor), the polling unit they subscribed to, and preferred language.",
  agents: ["hotline", "official", "verifier", "alert"],
  schema: z.object({}),
  async handler(_args, call, deps) {
    const p = await caller(call, deps);
    if (!p) return { known: false, say: "New caller. Greet them warmly and ask how you can help." };
    const roles = await deps.db
      .select({ kind: role.kind, puName: pollingUnit.name, puCode: pollingUnit.code })
      .from(role)
      .leftJoin(pollingUnit, eq(pollingUnit.id, role.puId))
      .where(eq(role.personId, p.id));
    const subs = await deps.db
      .select({ name: pollingUnit.name, code: pollingUnit.code, needs: subscription.needs })
      .from(subscription)
      .innerJoin(pollingUnit, eq(pollingUnit.id, subscription.puId))
      .where(and(eq(subscription.personId, p.id), eq(subscription.active, true)));
    const firstName = p.displayName.startsWith("Caller ") ? null : p.displayName;
    return {
      known: true,
      name: firstName,
      language_pref: p.languagePref,
      roles: roles.map((r) => ({ kind: r.kind, polling_unit: r.puName, polling_unit_code: r.puCode })),
      subscriptions: subs,
      say: firstName ? `Known caller: ${firstName}.` : "Returning caller.",
    };
  },
});

export const lookupPollingUnit = define({
  name: "lookup_polling_unit",
  description:
    "Find a polling unit by name, code, street or landmark the caller mentions (e.g. 'Ojuelegba primary school', 'stadium'). Returns address, landmark and whether it has been relocated.",
  agents: ["hotline"],
  schema: z.object({ query: z.string().min(2).max(200).describe("What the caller said about the polling unit, in English letters") }),
  async handler({ query }, _call, deps) {
    const matches = await searchPollingUnits(deps.db, query, 3);
    if (matches.length === 0) {
      return { matches: [], say: "No polling unit matched. Ask for the name of the school or place, or a nearby landmark." };
    }
    const top = matches[0]!;
    const say =
      top.status === "relocated" && top.relocatedTo
        ? `${top.name} has been RELOCATED to ${top.relocatedTo.name}, ${top.relocatedTo.address}${top.relocatedTo.landmark ? ` (${top.relocatedTo.landmark})` : ""}. Tell the caller clearly.`
        : `${top.name} is at ${top.address}${top.landmark ? `, ${top.landmark}` : ""}. It has not moved.`;
    return {
      matches: matches.map((m) => ({
        code: m.code,
        name: m.name,
        address: m.address,
        landmark: m.landmark,
        ward: placeName(m.wardName),
        status: m.status,
        relocated_to: m.relocatedTo,
      })),
      say,
    };
  },
});

export const puStatus = define({
  name: "pu_status",
  description: "Get the latest reports from officials at a polling unit: have they arrived, have materials arrived, has voting started, any delay.",
  agents: ["hotline"],
  schema: z.object({ polling_unit: z.string().min(2).max(200).describe("Polling unit name, code or landmark") }),
  async handler({ polling_unit }, _call, deps) {
    const [pu] = await searchPollingUnits(deps.db, polling_unit, 1);
    if (!pu) return { found: false, say: "I couldn't find that polling unit. Ask for the school or place name." };
    const rows = await deps.db
      .select({ event: checkin.event, note: checkin.note, eta: checkin.etaMinutes, at: checkin.at })
      .from(checkin)
      .where(eq(checkin.puId, pu.id))
      .orderBy(desc(checkin.at))
      .limit(5);
    const tz = deps.config.ELECTION_TZ;
    if (rows.length === 0) {
      return { found: true, polling_unit: pu.name, updates: [], say: `No official has reported from ${pu.name} yet today. Confam is watching it and will chase late officials.` };
    }
    const latest = rows[0]!;
    const human: Record<string, string> = {
      arrived: "officials arrived",
      materials_received: "voting materials arrived",
      voting_started: "voting started",
      delay: "officials reported a delay",
      issue: "officials reported a problem",
      closed: "voting closed",
    };
    const eta = latest.event === "delay" && latest.eta ? `, expected in about ${latest.eta} minutes` : "";
    const note = latest.note ? ` (${latest.note})` : "";
    return {
      found: true,
      polling_unit: pu.name,
      updates: rows.map((r) => ({ event: r.event, note: r.note, eta_minutes: r.eta, at: fmtTime(r.at, tz) })),
      say: `Latest at ${pu.name}: ${human[latest.event]}${eta}${note}, reported at ${fmtTime(latest.at, tz)}.`,
    };
  },
});

export const reportClaim = define({
  name: "report_claim",
  description:
    "Use when the caller reports or asks about a rumour or incident (violence, vote buying, polling unit moved, officials absent, materials missing, election postponed, result tampering). Translate the claim into one short English sentence. Returns either a verified answer to read out, or that Confam is checking and will call back.",
  agents: ["hotline"],
  schema: z.object({
    claim_en: z.string().min(5).max(300).describe("The claim as one short neutral English sentence, e.g. 'There is fighting at Ojuelegba polling unit'"),
    category: z.enum(CATEGORIES as [Category, ...Category[]]),
    place: z.string().min(2).max(200).describe("Where it is said to be happening: polling unit, school, street, area or ward"),
    raw_text: z.string().max(1000).optional().describe("The caller's own words, as heard"),
  }),
  async handler(args, call, deps) {
    const now = deps.now?.() ?? new Date();
    const place = await resolvePlace(deps.db, args.place);
    const area = { wardId: place.wardId, puId: place.pu?.id ?? null };

    const fact = await findMatchingFact(deps.db, args.claim_en, args.category, area, now);
    if (fact) {
      return {
        status: "known",
        verdict: fact.verdict,
        say: `Verified answer. Read this to the caller (English version / Pidgin version): EN: ${fact.scriptEn} || PCM: ${fact.scriptPcm}`,
      };
    }

    if (!call.party.phone) return { status: "not_saved", say: UNKNOWN_CALLER_SAY };
    const reporter = await ensurePerson(deps.db, deps.crypto, call.party.phone);

    const [recent] = await deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(report)
      .where(and(eq(report.personId, reporter.id), gte(report.createdAt, new Date(now.getTime() - 3600_000))));
    if ((recent?.n ?? 0) >= 10) {
      return { status: "rate_limited", say: "This caller has made many reports in the last hour. Thank them and say Confam is already checking their earlier reports." };
    }

    if (!place.wardId) {
      return { status: "need_place", say: "I need a more specific place in Surulere to check this. Ask which polling unit, school, street or area." };
    }

    let caseId: string;
    let isNew = false;
    const open = await findOpenCase(deps.db, args.claim_en, args.category, area);
    if (open) {
      caseId = open.id;
    } else {
      const [settings] = await deps.db.select().from(systemSettings).limit(1);
      const deadline = new Date(now.getTime() + (settings?.caseDeadlineMinutes ?? 10) * 60_000);
      const [row] = await deps.db
        .insert(claimCase)
        .values({ category: args.category, claimEn: args.claim_en, wardId: place.wardId, puId: area.puId, deadlineAt: deadline })
        .returning({ id: claimCase.id });
      caseId = row!.id;
      isNew = true;
    }

    const already = await deps.db
      .select({ id: report.id })
      .from(report)
      .where(and(eq(report.caseId, caseId), eq(report.personId, reporter.id)))
      .limit(1);
    if (already.length === 0) {
      await deps.db.insert(report).values({ caseId, personId: reporter.id, aethexCallId: call.callId, claimEn: args.claim_en, rawText: args.raw_text ?? null });
    }

    if (isNew) {
      await deps.jobs.send(QUEUES.caseVerify, { caseId }, { singletonKey: `verify:${caseId}` });
      const [c] = await deps.db.select({ deadlineAt: claimCase.deadlineAt }).from(claimCase).where(eq(claimCase.id, caseId));
      await deps.jobs.send(QUEUES.caseAggregate, { caseId, reason: "deadline" }, { startAfter: c!.deadlineAt });
    }
    await notify(deps.pool, { type: "case", id: caseId });

    return {
      status: "checking",
      case_id: caseId,
      place: place.label,
      say: "Not yet verified. Tell the caller Confam is checking with trusted people at that place right now and will call them back on this number within about 10 minutes. If anyone is in danger, tell them to move to safety and call 112.",
    };
  },
});

export const subscribe = define({
  name: "subscribe",
  description:
    "Register the caller for Confam alerts about their polling unit (relocation, verified rumours, officials' arrival). Only call after the caller clearly agrees to receive calls from Confam (consent must be true). Include any accessibility needs.",
  agents: ["hotline"],
  schema: z.object({
    polling_unit: z.string().min(2).max(200),
    consent: z.literal(true).describe("Caller explicitly agreed to receive calls"),
    needs: z.array(z.enum(NEEDS)).max(6).default([]),
    language: z.enum(LANGS).optional().describe("Language the caller spoke"),
  }),
  async handler(args, call, deps) {
    if (!call.party.phone) return { ok: false, say: UNKNOWN_CALLER_SAY };
    const [pu] = await searchPollingUnits(deps.db, args.polling_unit, 1);
    if (!pu) return { ok: false, say: "I couldn't find that polling unit. Ask for the school or place name, or a nearby landmark." };
    const p = await ensurePerson(deps.db, deps.crypto, call.party.phone);
    await deps.db
      .update(person)
      .set({ consentAt: new Date(), languagePref: args.language ?? p.languagePref })
      .where(eq(person.id, p.id));
    await deps.db
      .insert(subscription)
      .values({ personId: p.id, puId: pu.id, needs: args.needs })
      .onConflictDoUpdate({ target: [subscription.personId, subscription.puId], set: { needs: args.needs, active: true } });
    await notify(deps.pool, { type: "person", id: p.id });
    const access = args.needs.length > 0;
    return {
      ok: true,
      polling_unit: pu.name,
      say: `Subscribed to ${pu.name}. Confam will call if it moves, if there's verified news about it, ${access ? "and when the officials have arrived so they can go and vote. " : "and on election morning. "}Tell them they can say 'stop calls' anytime.`,
    };
  },
});

export const unsubscribe = define({
  name: "unsubscribe",
  description: "Stop all Confam alert calls to this caller.",
  agents: ["hotline", "alert"],
  schema: z.object({}),
  async handler(_args, call, deps) {
    const p = await caller(call, deps);
    if (!p) return { ok: true, say: "This number has no Confam alerts. Nothing to stop." };
    await deps.db.update(subscription).set({ active: false }).where(eq(subscription.personId, p.id));
    await deps.db.update(person).set({ consentAt: null }).where(eq(person.id, p.id));
    await notify(deps.pool, { type: "person", id: p.id });
    return { ok: true, say: "Done. Confam will not call this number with alerts again." };
  },
});

export const requestAccessibilitySupport = define({
  name: "request_accessibility_support",
  description:
    "For elderly voters or voters with a disability. Records their needs for their polling unit, alerts the officials there, and returns their legal rights to explain. Only call after the caller agrees to receive a call when officials arrive (consent).",
  agents: ["hotline"],
  schema: z.object({
    polling_unit: z.string().min(2).max(200),
    needs: z.array(z.enum(NEEDS)).min(1).max(6),
    consent: z.literal(true),
  }),
  async handler(args, call, deps) {
    const res = await subscribe.handler({ polling_unit: args.polling_unit, consent: true, needs: args.needs }, call, deps);
    if (!res.ok) return res;
    return {
      ok: true,
      rights: [
        "Priority access: elderly voters and persons with disability should not queue (INEC Regulations, para 25).",
        "You may bring a person of your choice into the voting booth to help you; a party agent or candidate cannot be your helper (Electoral Act 2026, s.54(1)).",
        "INEC must provide reasonable help such as braille ballot guides, magnifiers, or sign language (s.54(2)).",
      ],
      say: `Saved. Explain these rights simply: they don't need to queue; they can bring a helper they trust (not a party agent); INEC should provide aids like braille guides or magnifiers. Confam will tell the officials at ${res.polling_unit} and will call them when the officials have arrived.`,
    };
  },
});

export const officialCheckin = define({
  name: "official_checkin",
  description:
    "For polling officials only. Record a status update for their polling unit after they give their 4-digit Confam PIN. Events: arrived, materials_received, voting_started, delay (with eta_minutes), issue, closed.",
  agents: ["hotline", "official"],
  schema: z.object({
    pin: z.string().regex(/^\d{4}$/).describe("The official's 4-digit PIN, digits only"),
    event: z.enum(["arrived", "materials_received", "voting_started", "delay", "issue", "closed"]),
    eta_minutes: z.number().int().min(1).max(600).optional(),
    note: z.string().max(300).optional().describe("Short reason or details in English"),
  }),
  async handler(args, call, deps) {
    const p = await caller(call, deps);
    if (!p) return { ok: false, say: "This number is not registered as a polling official. Officials must call from their registered phone." };
    const [r] = await deps.db
      .select()
      .from(role)
      .where(and(eq(role.personId, p.id), eq(role.kind, "official")))
      .limit(1);
    if (!r || !r.puId) return { ok: false, say: "This number is not registered as a polling official for any polling unit." };
    const now = deps.now?.() ?? new Date();
    if (r.pinLockedUntil && r.pinLockedUntil > now) {
      return { ok: false, say: "Too many wrong PINs. Check-in is locked for one hour. They should contact their supervisor." };
    }
    if (!r.pinHash || !(await verifySecret(args.pin, r.pinHash))) {
      const failed = r.pinFailed + 1;
      await deps.db
        .update(role)
        .set({ pinFailed: failed >= 5 ? 0 : failed, pinLockedUntil: failed >= 5 ? new Date(now.getTime() + 3600_000) : null })
        .where(eq(role.id, r.id));
      return { ok: false, say: failed >= 5 ? "Wrong PIN. Check-in is now locked for one hour." : "That PIN is not correct. Ask them to say it again, digit by digit." };
    }
    await deps.db.update(role).set({ pinFailed: 0, pinLockedUntil: null }).where(eq(role.id, r.id));
    await deps.db.insert(checkin).values({
      puId: r.puId,
      personId: p.id,
      event: args.event,
      etaMinutes: args.eta_minutes ?? null,
      note: args.note ?? null,
      source: call.party.direction === "outbound" ? "outbound_call" : "inbound_call",
      at: now,
    });
    await notify(deps.pool, { type: "checkin", puId: r.puId });
    if (args.event === "arrived" || args.event === "voting_started") {
      await deps.jobs.send(QUEUES.alertGoNow, { puId: r.puId }, { singletonKey: `go-now:${r.puId}` });
    }
    const [pu] = await deps.db.select({ name: pollingUnit.name }).from(pollingUnit).where(eq(pollingUnit.id, r.puId));
    const accessCount = await deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(subscription)
      .where(and(eq(subscription.puId, r.puId), eq(subscription.active, true), sql`cardinality(${subscription.needs}) > 0`));
    const n = accessCount[0]?.n ?? 0;
    return {
      ok: true,
      polling_unit: pu?.name,
      say: `Recorded "${args.event.replace("_", " ")}" for ${pu?.name}. Thank them.${n > 0 ? ` Also tell them: ${n} elderly or disabled voter${n === 1 ? " is" : "s are"} expected at this polling unit; please give them priority and allow their chosen helper.` : ""}`,
    };
  },
});

export const recordVerifierAnswer = define({
  name: "record_verifier_answer",
  description:
    "Record the verifier's answer to the question you asked: yes (it is happening), no (it is not happening), or unknown (they can't see or don't know). Add a short English detail of what they said.",
  agents: ["verifier"],
  schema: z.object({
    answer: z.enum(["yes", "no", "unknown"]),
    detail: z.string().max(300).optional(),
  }),
  async handler(args, call, deps) {
    if (!call.callId) return { ok: false, say: "Thank them for their time." };
    const [vr] = await deps.db
      .select()
      .from(verificationRequest)
      .where(eq(verificationRequest.aethexCallId, call.callId))
      .limit(1);
    if (!vr) return { ok: false, say: "Thank them for their time." };
    if (vr.status !== "answered") {
      await deps.db
        .update(verificationRequest)
        .set({ status: "answered", answer: args.answer, detail: args.detail ?? null, answeredAt: new Date() })
        .where(eq(verificationRequest.id, vr.id));
      await deps.jobs.send(QUEUES.caseAggregate, { caseId: vr.caseId, reason: "answer" });
      await notify(deps.pool, { type: "case", id: vr.caseId });
    }
    return { ok: true, say: "Answer saved. Thank them warmly, remind them to stay safe, and end the call." };
  },
});

export const confirmAlertHeard = define({
  name: "confirm_alert_heard",
  description: "Call once the person has heard the whole alert message and acknowledged it.",
  agents: ["alert"],
  schema: z.object({}),
  async handler(_args, call, deps) {
    if (call.callId) {
      const rows = await deps.db
        .update(alert)
        .set({ status: "heard" })
        .where(and(eq(alert.aethexCallId, call.callId)))
        .returning({ id: alert.id });
      for (const r of rows) await notify(deps.pool, { type: "alert", id: r.id });
    }
    return { ok: true, say: "Thank them and end the call politely." };
  },
});

export const TOOLS: ToolDef[] = [
  identifyCaller,
  lookupPollingUnit,
  puStatus,
  reportClaim,
  subscribe,
  unsubscribe,
  requestAccessibilitySupport,
  officialCheckin,
  recordVerifierAnswer,
  confirmAlertHeard,
] as unknown as ToolDef[];

export const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

