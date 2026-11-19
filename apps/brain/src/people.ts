import { and, eq, isNull } from "drizzle-orm";
import { normalizePhone, person, type Db, type PhoneCrypto } from "@confam/db";

export type PersonRow = typeof person.$inferSelect;

export async function findPersonByPhone(db: Db, crypto: PhoneCrypto, phone: string): Promise<PersonRow | null> {
  let e164: string;
  try {
    e164 = normalizePhone(phone);
  } catch {
    return null;
  }
  const [row] = await db
    .select()
    .from(person)
    .where(and(eq(person.phoneHash, crypto.hash(e164)), isNull(person.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Find or create a person for an inbound caller (needed so we can call them back about their own report). */
export async function ensurePerson(db: Db, crypto: PhoneCrypto, phone: string): Promise<PersonRow> {
  const e164 = normalizePhone(phone);
  const phoneHash = crypto.hash(e164);
  const [row] = await db
    .insert(person)
    .values({ displayName: `Caller ••${e164.slice(-4)}`, phoneHash, phoneEnc: crypto.encrypt(e164), phoneLast4: e164.slice(-4) })
    .onConflictDoUpdate({ target: person.phoneHash, set: { deletedAt: null } })
    .returning();
  return row!;
}
