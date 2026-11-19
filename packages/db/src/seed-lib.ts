import { randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "./client.ts";
import { normalizePhone, type PhoneCrypto } from "./phone.ts";
import { person, pollingUnit, role, subscription, systemSettings, ward } from "./schema.ts";
import { hashSecret } from "./secret-hash.ts";
import { DEMO_PUS, OFFICIAL_PU_ORDER, SURULERE_WARDS, VOTER_PU_ORDER, wardCode } from "./seed-data.ts";

export interface SeedOptions {
  /** Real phones that act as presiding officers (assigned to OFFICIAL_PU_ORDER). */
  officialPhones: string[];
  /** Real phones on the INEC voter list (assigned to VOTER_PU_ORDER). */
  voterPhones: string[];
  /** PIN for seeded officials. If omitted, a random one is generated and returned (first creation only). */
  officialPin?: string;
}

export interface SeedResult {
  wards: number;
  pollingUnits: number;
  people: number;
  created: string[];
  retiredDemoContacts: number;
  generatedOfficialPin?: string;
}

/**
 * Idempotent. Reference data (wards, demo polling units) is upserted every run. People are only CREATED on first sight:
 * once a number exists, the control room owns it (moving a voter or renaming an official is never undone by a reboot).
 * Legacy fake demo contacts (is_demo) are retired: soft-deleted with their number erased.
 */
export async function seed(db: Db, crypto: PhoneCrypto, opts: SeedOptions): Promise<SeedResult> {
  await db.insert(systemSettings).values({ id: 1 }).onConflictDoNothing();

  const wardIds = new Map<string, string>();
  for (const [i, name] of SURULERE_WARDS.entries()) {
    const [row] = await db
      .insert(ward)
      .values({ state: "LAGOS", lga: "SURULERE", name, code: wardCode(i) })
      .onConflictDoUpdate({ target: ward.code, set: { name } })
      .returning({ id: ward.id });
    wardIds.set(name, row!.id);
  }

  const puIds = new Map<string, { id: string; wardId: string; name: string }>();
  for (const pu of DEMO_PUS) {
    const [row] = await db
      .insert(pollingUnit)
      .values({ wardId: wardIds.get(pu.ward)!, code: pu.code, name: pu.name, address: pu.address, landmark: pu.landmark, lat: pu.lat, lng: pu.lng, isDemo: true })
      .onConflictDoUpdate({ target: pollingUnit.code, set: { name: pu.name, address: pu.address, landmark: pu.landmark, lat: pu.lat, lng: pu.lng } })
      .returning({ id: pollingUnit.id, wardId: pollingUnit.wardId, name: pollingUnit.name });
    puIds.set(pu.code, row!);
  }

  // Retire legacy fake contacts so nothing in the system is pretend.
  const retired = await db
    .update(person)
    .set({ deletedAt: new Date(), phoneEnc: "deleted", consentAt: null })
    .where(and(eq(person.isDemo, true), isNull(person.deletedAt)))
    .returning({ id: person.id });
  for (const r of retired) {
    await db.update(subscription).set({ active: false }).where(eq(subscription.personId, r.id));
    await db.delete(role).where(eq(role.personId, r.id));
  }

  const created: string[] = [];
  let generatedOfficialPin: string | undefined;

  async function createIfNew(phone: string, displayName: string): Promise<string | null> {
    const e164 = normalizePhone(phone);
    const phoneHash = crypto.hash(e164);
    const [existing] = await db.select({ id: person.id, deletedAt: person.deletedAt, displayName: person.displayName }).from(person).where(eq(person.phoneHash, phoneHash)).limit(1);
    // Control room owns existing people, except legacy "Team phone N" records from the first seed, which are reassigned once.
    if (existing && !existing.deletedAt && !existing.displayName.startsWith("Team phone")) return null;
    const [row] = await db
      .insert(person)
      .values({ displayName, phoneHash, phoneEnc: crypto.encrypt(e164), phoneLast4: e164.slice(-4), isTeam: true, isDemo: false })
      .onConflictDoUpdate({ target: person.phoneHash, set: { displayName, phoneEnc: crypto.encrypt(e164), deletedAt: null, isDemo: false, isTeam: true } })
      .returning({ id: person.id });
    return row!.id;
  }

  for (const [i, phone] of opts.officialPhones.entries()) {
    const pu = puIds.get(OFFICIAL_PU_ORDER[i % OFFICIAL_PU_ORDER.length]!)!;
    const id = await createIfNew(phone, `Presiding officer, ${pu.name}`);
    if (!id) continue;
    let pin = opts.officialPin;
    if (!pin) {
      generatedOfficialPin ??= String(randomInt(0, 10_000)).padStart(4, "0");
      pin = generatedOfficialPin;
    }
    await db.delete(role).where(eq(role.personId, id));
    await db.update(subscription).set({ active: false }).where(eq(subscription.personId, id));
    await db.insert(role).values({ personId: id, kind: "official", wardId: pu.wardId, puId: pu.id, pinHash: await hashSecret(pin) });
    created.push(`official ••${normalizePhone(phone).slice(-4)} → ${pu.name}`);
  }

  for (const [i, phone] of opts.voterPhones.entries()) {
    const pu = puIds.get(VOTER_PU_ORDER[i % VOTER_PU_ORDER.length]!)!;
    const last4 = normalizePhone(phone).slice(-4);
    const id = await createIfNew(phone, `Voter ••${last4}`);
    if (!id) continue;
    await db.update(person).set({ consentAt: new Date() }).where(eq(person.id, id));
    await db.delete(role).where(eq(role.personId, id));
    await db.update(subscription).set({ active: false }).where(eq(subscription.personId, id));
    await db
      .insert(subscription)
      .values({ personId: id, puId: pu.id, kind: "voter", needs: [] })
      .onConflictDoUpdate({ target: [subscription.personId, subscription.puId], set: { kind: "voter", active: true } });
    created.push(`voter ••${last4} → ${pu.name}`);
  }

  const [counts] = await db
    .execute<{ wards: number; pus: number; people: number }>(
      sql`select (select count(*)::int from ward) as wards, (select count(*)::int from polling_unit) as pus, (select count(*)::int from person where deleted_at is null) as people`,
    )
    .then((r) => r.rows);
  return { wards: counts!.wards, pollingUnits: counts!.pus, people: counts!.people, created, retiredDemoContacts: retired.length, generatedOfficialPin };
}
