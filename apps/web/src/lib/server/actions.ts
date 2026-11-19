"use server";

import { randomInt, randomUUID } from "node:crypto";
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
  redirect("/control");
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
  revalidatePath("/control", "layout");
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
  revalidatePath("/control", "layout");
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
  revalidatePath(`/control/rumours/${caseId}`);
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
  revalidatePath("/control/units");
  return { ok: true, message: `Notice issued. Confam is calling everyone subscribed to ${oldPu.name}.` };
}

export async function undoRelocation(puId: string): Promise<ActionState> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(puId).success) return fail("Unknown polling unit.");
  await getDb().db.update(pollingUnit).set({ status: "active", relocatedToId: null }).where(eq(pollingUnit.id, puId));
  revalidatePath("/control/units");
  return { ok: true, message: "Marked as active again. No calls are made for this change." };
}

// ---------- people ----------

const NEEDS = ["elderly", "mobility", "low_vision", "blind", "hearing", "other"] as const;

function parsePhone(raw: string): { ok: true; e164: string } | { ok: false; message: string } {
  try {
    return { ok: true, e164: normalizePhone(raw) };
  } catch (err) {
    return { ok: false, message: err instanceof PhoneError ? "That phone number doesn't look right. Use 080… or +234…" : "Invalid phone number." };
  }
}

/** Create (or revive) a person by phone. Existing people keep their record; the name is updated. */
async function upsertPerson(displayName: string, e164: string) {
  const crypto = getCrypto();
  const { db } = getDb();
  const [p] = await db
    .insert(person)
    .values({ displayName, phoneHash: crypto.hash(e164), phoneEnc: crypto.encrypt(e164), phoneLast4: e164.slice(-4), isTeam: true })
    .onConflictDoUpdate({ target: person.phoneHash, set: { displayName, deletedAt: null, isDemo: false, phoneEnc: crypto.encrypt(e164) } })
    .returning({ id: person.id });
  return p!.id;
}

const VoterSchema = z.object({
  displayName: z.string().trim().min(2, "Enter the voter's name").max(80),
  phone: z.string().trim().min(7, "Enter a phone number"),
  puId: z.string().uuid("Choose the polling unit they are registered at"),
});

/** Register a voter on the INEC voter list (one polling unit per voter). */
export async function addVoter(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = VoterSchema.safeParse({ displayName: form.get("displayName"), phone: form.get("phone"), puId: form.get("puId") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const needs = form.getAll("needs").map(String).filter((n): n is (typeof NEEDS)[number] => (NEEDS as readonly string[]).includes(n));
  const phone = parsePhone(parsed.data.phone);
  if (!phone.ok) return fail(phone.message);
  const { db, pool } = getDb();
  const personId = await upsertPerson(parsed.data.displayName, phone.e164);
  await db.update(person).set({ consentAt: new Date() }).where(eq(person.id, personId));
  await db.update(subscription).set({ active: false }).where(and(eq(subscription.personId, personId), eq(subscription.kind, "voter")));
  await db
    .insert(subscription)
    .values({ personId, puId: parsed.data.puId, kind: "voter", needs })
    .onConflictDoUpdate({ target: [subscription.personId, subscription.puId], set: { kind: "voter", active: true, needs } });
  await notify(pool, { type: "person", id: personId });
  revalidatePath("/control/voters");
  return { ok: true, message: `${parsed.data.displayName} is now on the voter list. They can call Confam to check their polling unit and will be called if it changes.` };
}

/** INEC moves ONE voter to another polling unit: update the register and call them straight away. */
export async function moveVoter(personId: string, newPuId: string): Promise<ActionState> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(personId).success || !z.string().uuid().safeParse(newPuId).success) return fail("Choose the new polling unit.");
  const { db, pool } = getDb();
  const [current] = await db
    .select({ id: subscription.id, puId: subscription.puId, needs: subscription.needs })
    .from(subscription)
    .where(and(eq(subscription.personId, personId), eq(subscription.kind, "voter"), eq(subscription.active, true)))
    .limit(1);
  if (!current) return fail("This person is not on the voter list.");
  if (current.puId === newPuId) return fail("They are already registered at that polling unit.");
  const [to] = await db.select({ name: pollingUnit.name }).from(pollingUnit).where(eq(pollingUnit.id, newPuId));
  if (!to) return fail("That polling unit no longer exists.");
  await db.transaction(async (tx) => {
    // A row for the new unit may exist (e.g. an old assistance request); remove it so the voter row can move there.
    await tx.delete(subscription).where(and(eq(subscription.personId, personId), eq(subscription.puId, newPuId)));
    await tx.update(subscription).set({ puId: newPuId, goNowSentAt: null }).where(eq(subscription.id, current.id));
  });
  await sendJob(QUEUES.alertTransfer, { personId, fromPuId: current.puId, toPuId: newPuId, transferId: randomUUID() });
  await notify(pool, { type: "person", id: personId });
  revalidatePath("/control/voters");
  return { ok: true, message: `Moved to ${to.name}. Confam is calling them now.` };
}

const OfficialSchema = z.object({
  displayName: z.string().trim().min(2, "Enter the official's name").max(80),
  phone: z.string().trim().min(7, "Enter a phone number"),
  puId: z.string().uuid("Choose the polling unit they run"),
});

/** Register a presiding officer. Only numbers registered here are recognised as officials by the phone agent. */
export async function addOfficial(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = OfficialSchema.safeParse({ displayName: form.get("displayName"), phone: form.get("phone"), puId: form.get("puId") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const phone = parsePhone(parsed.data.phone);
  if (!phone.ok) return fail(phone.message);
  const { db, pool } = getDb();
  const [pu] = await db.select({ wardId: pollingUnit.wardId, name: pollingUnit.name }).from(pollingUnit).where(eq(pollingUnit.id, parsed.data.puId));
  if (!pu) return fail("That polling unit no longer exists.");
  const personId = await upsertPerson(parsed.data.displayName, phone.e164);
  const pin = String(randomInt(0, 10_000)).padStart(4, "0");
  await db.delete(role).where(and(eq(role.personId, personId), eq(role.kind, "official")));
  await db.insert(role).values({ personId, kind: "official", wardId: pu.wardId, puId: parsed.data.puId, pinHash: await hashSecret(pin) });
  await notify(pool, { type: "person", id: personId });
  revalidatePath("/control/officials");
  return { ok: true, message: `${parsed.data.displayName} is now the presiding officer for ${pu.name}. Share this check-in PIN privately; it is shown once.`, secret: pin };
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
  revalidatePath("/control/officials");
  return { ok: true, message: "New PIN issued. Share it with the official privately; it is shown once.", secret: pin };
}

export async function removePerson(personId: string): Promise<ActionState> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(personId).success) return fail("Unknown person.");
  const { db, pool } = getDb();
  // Soft delete and crypto-shred the number: the encrypted phone is overwritten so it can never be dialled again.
  await db.update(person).set({ deletedAt: new Date(), phoneEnc: "deleted", consentAt: null }).where(eq(person.id, personId));
  await db.update(subscription).set({ active: false }).where(eq(subscription.personId, personId));
  await db.delete(role).where(eq(role.personId, personId));
  await notify(pool, { type: "person", id: personId });
  revalidatePath("/control/voters");
  revalidatePath("/control/officials");
  return { ok: true, message: "Removed. Their number has been erased and will never be called." };
}
