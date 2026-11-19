import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const claimCategory = pgEnum("claim_category", [
  "violence",
  "vote_buying",
  "pu_relocated",
  "officials_absent",
  "materials_missing",
  "election_postponed",
  "result_tampering",
  "other",
]);
export const verdictEnum = pgEnum("verdict", ["confirmed", "false", "unverified"]);
export const caseStatus = pgEnum("case_status", ["verifying", "published"]);
export const roleKind = pgEnum("role_kind", ["verifier", "official", "supervisor"]);
export const answerEnum = pgEnum("answer", ["yes", "no", "unknown"]);
export const checkinEvent = pgEnum("checkin_event", ["arrived", "materials_received", "voting_started", "delay", "issue", "closed"]);
export const callDirection = pgEnum("call_direction", ["inbound", "outbound"]);
export const outboundPurpose = pgEnum("outbound_purpose", [
  "verify",
  "case_alert",
  "notice_alert",
  "go_now",
  "late_official",
  "late_supervisor",
]);
export const outboundDecision = pgEnum("outbound_decision", [
  "dialled",
  "skipped_paused",
  "skipped_demo_contact",
  "skipped_not_allowlisted",
  "skipped_cooldown",
  "skipped_quiet_hours",
  "skipped_no_phone",
  "error",
]);
export const adminRole = pgEnum("admin_role", ["admin", "viewer"]);

export const ward = pgTable(
  "ward",
  {
    id: id(),
    state: text("state").notNull(),
    lga: text("lga").notNull(),
    name: text("name").notNull(),
    code: text("code").notNull(),
  },
  (t) => [uniqueIndex("ward_code_uq").on(t.code)],
);

export const pollingUnit = pgTable(
  "polling_unit",
  {
    id: id(),
    wardId: uuid("ward_id").notNull().references(() => ward.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    address: text("address").notNull(),
    landmark: text("landmark"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    status: text("status", { enum: ["active", "relocated"] }).notNull().default("active"),
    relocatedToId: uuid("relocated_to_id"),
    isDemo: boolean("is_demo").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("pu_code_uq").on(t.code), index("pu_ward_idx").on(t.wardId)],
);

export const person = pgTable(
  "person",
  {
    id: id(),
    displayName: text("display_name").notNull(),
    phoneHash: text("phone_hash").notNull(),
    phoneEnc: text("phone_enc").notNull(),
    phoneLast4: text("phone_last4").notNull(),
    languagePref: text("language_pref", { enum: ["english", "pidgin", "yoruba", "hausa", "igbo"] }),
    isDemo: boolean("is_demo").notNull().default(false),
    isTeam: boolean("is_team").notNull().default(false),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("person_phone_hash_uq").on(t.phoneHash)],
);

export const role = pgTable(
  "role",
  {
    id: id(),
    personId: uuid("person_id").notNull().references(() => person.id, { onDelete: "cascade" }),
    kind: roleKind("kind").notNull(),
    wardId: uuid("ward_id").notNull().references(() => ward.id),
    puId: uuid("pu_id").references(() => pollingUnit.id),
    affiliation: text("affiliation"),
    reputation: doublePrecision("reputation").notNull().default(1),
    pinHash: text("pin_hash"),
    pinFailed: integer("pin_failed").notNull().default(0),
    pinLockedUntil: timestamp("pin_locked_until", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("role_ward_kind_idx").on(t.wardId, t.kind), index("role_pu_idx").on(t.puId)],
);

export const subscription = pgTable(
  "subscription",
  {
    id: id(),
    personId: uuid("person_id").notNull().references(() => person.id, { onDelete: "cascade" }),
    puId: uuid("pu_id").notNull().references(() => pollingUnit.id),
    needs: text("needs").array().notNull().default(sql`'{}'::text[]`),
    /** voter = on the INEC voter list (managed in the control room); assistance = anyone who asked for elderly/disability help by phone */
    kind: text("kind", { enum: ["voter", "assistance"] }).notNull().default("voter"),
    active: boolean("active").notNull().default(true),
    goNowSentAt: timestamp("go_now_sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("subscription_person_pu_uq").on(t.personId, t.puId), index("subscription_pu_idx").on(t.puId)],
);

export const claimCase = pgTable(
  "claim_case",
  {
    id: id(),
    category: claimCategory("category").notNull(),
    claimEn: text("claim_en").notNull(),
    wardId: uuid("ward_id").references(() => ward.id),
    puId: uuid("pu_id").references(() => pollingUnit.id),
    status: caseStatus("status").notNull().default("verifying"),
    verdict: verdictEnum("verdict"),
    confidence: doublePrecision("confidence"),
    basis: text("basis"),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    overriddenBy: text("overridden_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("case_area_idx").on(t.wardId, t.category, t.status),
    index("case_claim_trgm_idx").using("gin", sql`${t.claimEn} gin_trgm_ops`),
  ],
);

export const report = pgTable(
  "report",
  {
    id: id(),
    caseId: uuid("case_id").notNull().references(() => claimCase.id, { onDelete: "cascade" }),
    personId: uuid("person_id").references(() => person.id),
    aethexCallId: text("aethex_call_id"),
    claimEn: text("claim_en").notNull(),
    rawText: text("raw_text"),
    createdAt: createdAt(),
  },
  (t) => [index("report_case_idx").on(t.caseId), index("report_person_idx").on(t.personId, t.createdAt)],
);

export const verificationRequest = pgTable(
  "verification_request",
  {
    id: id(),
    caseId: uuid("case_id").notNull().references(() => claimCase.id, { onDelete: "cascade" }),
    personId: uuid("person_id").notNull().references(() => person.id),
    /** nullable so removing an official or verifier keeps the verification history */
    roleId: uuid("role_id").references(() => role.id, { onDelete: "set null" }),
    status: text("status", { enum: ["pending", "calling", "answered", "no_answer", "skipped", "failed"] })
      .notNull()
      .default("pending"),
    answer: answerEnum("answer"),
    detail: text("detail"),
    weight: doublePrecision("weight").notNull().default(1),
    affiliation: text("affiliation"),
    aethexCallId: text("aethex_call_id"),
    attempts: integer("attempts").notNull().default(0),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("vr_case_person_uq").on(t.caseId, t.personId),
    index("vr_call_idx").on(t.aethexCallId),
  ],
);

export const fact = pgTable(
  "fact",
  {
    id: id(),
    caseId: uuid("case_id").references(() => claimCase.id, { onDelete: "cascade" }),
    category: claimCategory("category").notNull(),
    claimEn: text("claim_en").notNull(),
    verdict: verdictEnum("verdict").notNull(),
    scriptEn: text("script_en").notNull(),
    scriptPcm: text("script_pcm").notNull(),
    wardId: uuid("ward_id").references(() => ward.id),
    puId: uuid("pu_id").references(() => pollingUnit.id),
    validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("fact_area_idx").on(t.wardId, t.category),
    index("fact_claim_trgm_idx").using("gin", sql`${t.claimEn} gin_trgm_ops`),
  ],
);

export const notice = pgTable("notice", {
  id: id(),
  puId: uuid("pu_id").notNull().references(() => pollingUnit.id),
  kind: text("kind", { enum: ["relocation"] }).notNull(),
  body: text("body").notNull(),
  newPuId: uuid("new_pu_id").references(() => pollingUnit.id),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
});

export const checkin = pgTable(
  "checkin",
  {
    id: id(),
    puId: uuid("pu_id").notNull().references(() => pollingUnit.id),
    personId: uuid("person_id").references(() => person.id),
    event: checkinEvent("event").notNull(),
    note: text("note"),
    etaMinutes: integer("eta_minutes"),
    source: text("source", { enum: ["inbound_call", "outbound_call", "dashboard"] }).notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("checkin_pu_at_idx").on(t.puId, t.at)],
);

export const alert = pgTable(
  "alert",
  {
    id: id(),
    kind: text("kind", { enum: ["case", "notice", "go_now", "transfer"] }).notNull(),
    refId: uuid("ref_id").notNull(),
    personId: uuid("person_id").notNull().references(() => person.id),
    scriptEn: text("script_en").notNull(),
    scriptPcm: text("script_pcm").notNull(),
    status: text("status", { enum: ["pending", "calling", "delivered", "heard", "no_answer", "skipped", "failed"] })
      .notNull()
      .default("pending"),
    aethexCallId: text("aethex_call_id"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("alert_kind_ref_person_uq").on(t.kind, t.refId, t.personId), index("alert_call_idx").on(t.aethexCallId)],
);

export const outboundAttempt = pgTable(
  "outbound_attempt",
  {
    id: id(),
    personId: uuid("person_id").references(() => person.id),
    purpose: outboundPurpose("purpose").notNull(),
    refId: uuid("ref_id"),
    decision: outboundDecision("decision").notNull(),
    aethexCallId: text("aethex_call_id"),
    error: text("error"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("oa_person_at_idx").on(t.personId, t.at), index("oa_at_idx").on(t.at)],
);

export const call = pgTable(
  "call",
  {
    id: id(),
    aethexCallId: text("aethex_call_id").notNull(),
    agent: text("agent"),
    direction: callDirection("direction"),
    personId: uuid("person_id").references(() => person.id),
    purpose: outboundPurpose("purpose"),
    refId: uuid("ref_id"),
    status: text("status"),
    durationS: integer("duration_s"),
    costCents: integer("cost_cents"),
    transcript: jsonb("transcript"),
    transcriptText: text("transcript_text"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("call_aethex_uq").on(t.aethexCallId), index("call_created_idx").on(t.createdAt)],
);

export const webhookEvent = pgTable("webhook_event", {
  eventId: text("event_id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const systemSettings = pgTable("system_settings", {
  id: integer("id").primaryKey().default(1),
  outboundPaused: boolean("outbound_paused").notNull().default(false),
  electionDay: boolean("election_day").notNull().default(false),
  openingDeadline: text("opening_deadline").notNull().default("07:45"),
  verdictMinAnswers: integer("verdict_min_answers").notNull().default(1),
  verdictThreshold: doublePrecision("verdict_threshold").notNull().default(0.7),
  caseDeadlineMinutes: integer("case_deadline_minutes").notNull().default(10),
  factValidHours: integer("fact_valid_hours").notNull().default(1),
  quietStart: text("quiet_start").notNull().default("21:00"),
  quietEnd: text("quiet_end").notNull().default("07:00"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminUser = pgTable("admin_user", {
  id: id(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: adminRole("role").notNull().default("viewer"),
  createdAt: createdAt(),
});
