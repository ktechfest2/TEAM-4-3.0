"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  adminUser,
  claimCase,
  hashSecret,
  normalizePhone,
  notice,
  notify,
  person,
  PhoneError,
  pollingUnit,
  QUEUES,
  role,
  subscription,
  systemSettings,
  verifySecret,
} from "@confam/db";
import { getCrypto, getDb, sendJob } from "./db";
import { createSession, destroySession, requireAdmin } from "./session";

export type ActionState = { ok: boolean; message: string; secret?: string } | null;

const fail = (message: string): ActionState => ({ ok: false, message });

// ---------- auth ----------

const loginAttempts = new Map<string, { n: number; at: number }>();

export async function login(_prev: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1).max(200) }).safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return fail("Enter your email and password.");
  const email = parsed.data.email.toLowerCase();
  const a = loginAttempts.get(email);
  if (a && a.n >= 5 && Date.now() - a.at < 15 * 60_000) return fail("Too many attempts. Wait 15 minutes and try again.");
  const [u] = await getDb().db.select().from(adminUser).where(eq(adminUser.email, email)).limit(1);
  const ok = u ? await verifySecret(parsed.data.password, u.passwordHash) : await verifySecret(parsed.data.password, "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  if (!u || !ok) {
    loginAttempts.set(email, { n: (a && Date.now() - a.at < 15 * 60_000 ? a.n : 0) + 1, at: Date.now() });
    return fail("That email and password don't match a control-room account.");
  }
  loginAttempts.delete(email);
  await createSession({ id: u.id, email: u.email, role: u.role });
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

// ---------- system controls ----------

export async function setOutboundPaused(paused: boolean): Promise<ActionState> {
  await requireAdmin();
  const { db, pool } = getDb();
  await db.update(systemSettings).set({ outboundPaused: paused, updatedAt: new Date() }).where(eq(systemSettings.id, 1));
  await notify(pool, { type: "settings" });
  revalidatePath("/", "layout");
  return { ok: true, message: paused ? "Outbound calls paused. Nothing will be dialled." : "Outbound calls are live." };
}

const SettingsSchema = z.object({
  electionDay: z.boolean(),
  openingDeadline: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM, 24-hour"),
  verdictMinAnswers: z.coerce.number().int().min(1).max(5),
  verdictThreshold: z.coerce.number().min(0.5).max(1),
  caseDeadlineMinutes: z.coerce.number().int().min(2).max(120),
  factValidHours: z.coerce.number().int().min(1).max(48),
  quietStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  quietEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

export async function updateSettings(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = SettingsSchema.safeParse({
    electionDay: form.get("electionDay") === "on",
    openingDeadline: form.get("openingDeadline"),
    verdictMinAnswers: form.get("verdictMinAnswers"),
    verdictThreshold: form.get("verdictThreshold"),
    caseDeadlineMinutes: form.get("caseDeadlineMinutes"),
    factValidHours: form.get("factValidHours"),
    quietStart: form.get("quietStart"),
    quietEnd: form.get("quietEnd"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the highlighted values.");
  const { db, pool } = getDb();
  await db.update(systemSettings).set({ ...parsed.data, updatedAt: new Date() }).where(eq(systemSettings.id, 1));
  await notify(pool, { type: "settings" });
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}

// ---------- verdicts ----------

export async function overrideVerdict(caseId: string, verdict: "confirmed" | "false" | "unverified"): Promise<ActionState> {
  const user = await requireAdmin();
  const parsed = z.object({ caseId: z.string().uuid(), verdict: z.enum(["confirmed", "false", "unverified"]) }).safeParse({ caseId, verdict });
  if (!parsed.success) return fail("Pick a verdict.");
  const [c] = await getDb().db.select({ id: claimCase.id }).from(claimCase).where(eq(claimCase.id, caseId));
  if (!c) return fail("This rumour no longer exists.");
  await sendJob(QUEUES.caseOverride, { caseId, verdict, by: user.email });
  revalidatePath(`/rumours/${caseId}`);
  return { ok: true, message: "Verdict set. Everyone who reported it gets a correction call." };
}

// ---------- notices ----------

export async function createRelocation(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const parsed = z
    .object({ puId: z.string().uuid("Choose the polling unit that moved"), newPuId: z.string().uuid("Choose where it moved to") })
    .refine((v) => v.puId !== v.newPuId, { message: "The new location must be a different polling unit." })
    .safeParse({ puId: form.get("puId"), newPuId: form.get("newPuId") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Choose both polling units.");
  const { db, pool } = getDb();
  const [oldPu] = await db.select().from(pollingUnit).where(eq(pollingUnit.id, parsed.data.puId));
  const [newPu] = await db.select().from(pollingUnit).where(eq(pollingUnit.id, parsed.data.newPuId));
  if (!oldPu || !newPu) return fail("One of those polling units no longer exists.");
  if (oldPu.status === "relocated" && oldPu.relocatedToId === newPu.id) return fail(`${oldPu.name} is already marked as moved to ${newPu.name}.`);
  const [n] = await db.transaction(async (tx) => {
    await tx.update(pollingUnit).set({ status: "relocated", relocatedToId: newPu.id }).where(eq(pollingUnit.id, oldPu.id));
    return tx
      .insert(notice)
      .values({ puId: oldPu.id, kind: "relocation", newPuId: newPu.id, body: `${oldPu.name} moved to ${newPu.name}, ${newPu.address}`, createdBy: user.email })
      .returning({ id: notice.id });
  });
  await sendJob(QUEUES.alertNotice, { noticeId: n!.id }, { singletonKey: `notice:${n!.id}` });
  await notify(pool, { type: "notice", id: n!.id });
  revalidatePath("/units");
  return { ok: true, message: `Notice issued. Confam is calling everyone subscribed to ${oldPu.name}.` };
}

export async function undoRelocation(puId: string): Promise<ActionState> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(puId).success) return fail("Unknown polling unit.");
  await getDb().db.update(pollingUnit).set({ status: "active", relocatedToId: null }).where(eq(pollingUnit.id, puId));
  revalidatePath("/units");
  return { ok: true, message: "Marked as active again. No calls are made for this change." };
}

// ---------- people ----------

const PersonSchema = z.object({
  displayName: z.string().trim().min(2, "Enter a name").max(80),
  phone: z.string().trim().min(7, "Enter a phone number"),
  kind: z.enum(["verifier", "official", "supervisor", "voter"]),
  wardId: z.string().uuid("Choose a ward"),
  puId: z.string().uuid().optional().or(z.literal("")),
  affiliation: z.enum(["community", "observer", "faith", "party_a", "party_b", "party_c", "other"]).optional().or(z.literal("")),
});

export async function addPerson(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = PersonSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const d = parsed.data;
  let e164: string;
  try {
    e164 = normalizePhone(d.phone);
  } catch (err) {
    return fail(err instanceof PhoneError ? "That phone number doesn't look right. Use 080… or +234…" : "Invalid phone number.");
  }
  if ((d.kind === "official" || d.kind === "voter") && !d.puId) return fail("Officials and voters need a polling unit.");
  const crypto = getCrypto();
  const { db, pool } = getDb();
  const allow = new Set((process.env.DEMO_TEAM_PHONES ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((p) => { try { return normalizePhone(p); } catch { return ""; } }));
  const [p] = await db
    .insert(person)
    .values({ displayName: d.displayName, phoneHash: crypto.hash(e164), phoneEnc: crypto.encrypt(e164), phoneLast4: e164.slice(-4), isTeam: allow.has(e164), consentAt: d.kind === "voter" ? new Date() : null })
    .onConflictDoUpdate({ target: person.phoneHash, set: { displayName: d.displayName, deletedAt: null, phoneEnc: crypto.encrypt(e164) } })
    .returning({ id: person.id });
  let secret: string | undefined;
  if (d.kind === "voter") {
    await db.insert(subscription).values({ personId: p!.id, puId: d.puId! }).onConflictDoUpdate({ target: [subscription.personId, subscription.puId], set: { active: true } });
  } else {
    const pin = d.kind === "official" ? String(randomInt(0, 10_000)).padStart(4, "0") : null;
    await db.insert(role).values({ personId: p!.id, kind: d.kind, wardId: d.wardId, puId: d.puId || null, affiliation: d.affiliation || null, pinHash: pin ? await hashSecret(pin) : null });
    if (pin) secret = pin;
  }
  await notify(pool, { type: "person", id: p!.id });
  revalidatePath("/people");
  return { ok: true, message: secret ? `Added ${d.displayName}. Their check-in PIN is shown once below.` : `Added ${d.displayName}.`, secret };
}

export async function resetPin(roleId: string): Promise<ActionState> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(roleId).success) return fail("Unknown role.");
  const pin = String(randomInt(0, 10_000)).padStart(4, "0");
  const res = await getDb().db
    .update(role)
    .set({ pinHash: await hashSecret(pin), pinFailed: 0, pinLockedUntil: null })
    .where(and(eq(role.id, roleId), eq(role.kind, "official")))
    .returning({ id: role.id });
  if (res.length === 0) return fail("Only polling officials have PINs.");
  revalidatePath("/people");
  return { ok: true, message: "New PIN issued. Share it with the official privately; it is shown once.", secret: pin };
}

export async function removePerson(personId: string): Promise<ActionState> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(personId).success) return fail("Unknown person.");
  const { db, pool } = getDb();
  // Soft delete and crypto-shred the number: the encrypted phone is overwritten so it can never be dialled again.
  await db.update(person).set({ deletedAt: new Date(), phoneEnc: "deleted", consentAt: null }).where(eq(person.id, personId));
  await notify(pool, { type: "person", id: personId });
  revalidatePath("/people");
  return { ok: true, message: "Removed. Their number has been erased and will never be called." };
}
