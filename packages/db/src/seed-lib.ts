import { randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "./client.ts";
import { normalizePhone, type PhoneCrypto } from "./phone.ts";
import { pollingUnit, person, role, subscription, systemSettings, ward } from "./schema.ts";
import { hashSecret } from "./secret-hash.ts";
import { DEMO_PEOPLE, DEMO_PUS, SURULERE_WARDS, TEAM_ASSIGNMENTS, wardCode, type DemoPerson } from "./seed-data.ts";

export interface SeedOptions {
  teamPhones: string[];
  /** PIN for team officials. If omitted and none is set yet, a random one is generated and returned. */
  officialPin?: string;
}

export interface SeedResult {
  wards: number;
  pollingUnits: number;
  people: number;
  generatedOfficialPin?: string;
}

/** Idempotent: safe to run repeatedly. Upserts by natural keys (ward code, PU code, phone hash). */
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

  const puIds = new Map<string, string>();
  for (const pu of DEMO_PUS) {
    const values = {
      wardId: wardIds.get(pu.ward)!,
      code: pu.code,
      name: pu.name,
      address: pu.address,
      landmark: pu.landmark,
      lat: pu.lat,
      lng: pu.lng,
      isDemo: true,
    };
    const [row] = await db
      .insert(pollingUnit)
      .values(values)
      .onConflictDoUpdate({ target: pollingUnit.code, set: { name: pu.name, address: pu.address, landmark: pu.landmark, lat: pu.lat, lng: pu.lng } })
      .returning({ id: pollingUnit.id });
    puIds.set(pu.code, row!.id);
  }

  let generatedOfficialPin: string | undefined;
  const officialPin = opts.officialPin;

  async function upsertPerson(p: Omit<DemoPerson, "key">, flags: { isDemo: boolean; isTeam: boolean }) {
    const e164 = normalizePhone(p.phone);
    const phoneHash = crypto.hash(e164);
    const [row] = await db
      .insert(person)
      .values({
        displayName: p.displayName,
        phoneHash,
        phoneEnc: crypto.encrypt(e164),
        phoneLast4: e164.slice(-4),
        isDemo: flags.isDemo,
        isTeam: flags.isTeam,
        consentAt: p.subscriptions?.length ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: person.phoneHash,
        set: { displayName: p.displayName, isDemo: flags.isDemo, isTeam: flags.isTeam, deletedAt: null },
      })
      .returning({ id: person.id });
    const personId = row!.id;

    for (const r of p.roles) {
      const wardId = wardIds.get(r.ward)!;
      const puId = r.puCode ? puIds.get(r.puCode)! : null;
      const existing = await db
        .select({ id: role.id, pinHash: role.pinHash })
        .from(role)
        .where(and(eq(role.personId, personId), eq(role.kind, r.kind), eq(role.wardId, wardId), puId ? eq(role.puId, puId) : isNull(role.puId)))
        .limit(1);
      let pinHash: string | null = existing[0]?.pinHash ?? null;
      if (r.kind === "official" && flags.isTeam && (officialPin || !pinHash)) {
        let pin = officialPin;
        if (!pin) {
          generatedOfficialPin ??= String(randomInt(0, 10_000)).padStart(4, "0");
          pin = generatedOfficialPin;
        }
        pinHash = await hashSecret(pin);
      }
      if (existing[0]) {
        await db.update(role).set({ affiliation: r.affiliation ?? null, pinHash }).where(eq(role.id, existing[0].id));
      } else {
        await db.insert(role).values({ personId, kind: r.kind, wardId, puId, affiliation: r.affiliation ?? null, pinHash });
      }
    }
    for (const s of p.subscriptions ?? []) {
      await db
        .insert(subscription)
        .values({ personId, puId: puIds.get(s.puCode)!, needs: s.needs })
        .onConflictDoUpdate({ target: [subscription.personId, subscription.puId], set: { needs: s.needs, active: true } });
    }
  }

  for (const p of DEMO_PEOPLE) await upsertPerson(p, { isDemo: true, isTeam: false });
  for (const [i, phone] of opts.teamPhones.entries()) {
    const template = TEAM_ASSIGNMENTS[i];
    if (!template) break;
    await upsertPerson({ ...template, phone }, { isDemo: false, isTeam: true });
  }

  const [counts] = await db.execute<{ wards: number; pus: number; people: number }>(
    sql`select (select count(*)::int from ward) as wards, (select count(*)::int from polling_unit) as pus, (select count(*)::int from person where deleted_at is null) as people`,
  ).then((r) => r.rows);
  return { wards: counts!.wards, pollingUnits: counts!.pus, people: counts!.people, generatedOfficialPin };
}
