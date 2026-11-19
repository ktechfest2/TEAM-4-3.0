import { sql } from "drizzle-orm";
import type { Db } from "@confam/db";
import type { Category } from "./scripts.ts";

/** pg_trgm similarity floor for treating two claims in the same area+category as the same rumour. */
export const MATCH_THRESHOLD = 0.35;

export interface FactMatch {
  id: string;
  verdict: "confirmed" | "false" | "unverified";
  scriptEn: string;
  scriptPcm: string;
  similarity: number;
}

export interface CaseMatch {
  id: string;
  similarity: number;
}

interface Area {
  wardId: string | null;
  puId: string | null;
}

/**
 * Same category AND same area, and either the same PU or text similarity >= threshold.
 * Facts must still be valid and not superseded.
 */
export async function findMatchingFact(db: Db, claimEn: string, category: Category, area: Area, now = new Date()): Promise<FactMatch | null> {
  const res = await db.execute<{ id: string; verdict: FactMatch["verdict"]; script_en: string; script_pcm: string; sim: number }>(sql`
    select id, verdict, script_en, script_pcm, similarity(claim_en, ${claimEn}) as sim
    from fact
    where category = ${category}
      and superseded_at is null
      and valid_until > ${now}
      and (
        (${area.puId}::uuid is not null and pu_id = ${area.puId}::uuid)
        or (${area.wardId}::uuid is not null and ward_id = ${area.wardId}::uuid and similarity(claim_en, ${claimEn}) >= ${MATCH_THRESHOLD})
        or (ward_id is null and pu_id is null and similarity(claim_en, ${claimEn}) >= ${MATCH_THRESHOLD})
      )
    order by (pu_id is not distinct from ${area.puId}::uuid) desc, sim desc, created_at desc
    limit 1`);
  const row = res.rows[0];
  return row ? { id: row.id, verdict: row.verdict, scriptEn: row.script_en, scriptPcm: row.script_pcm, similarity: Number(row.sim) } : null;
}

export async function findOpenCase(db: Db, claimEn: string, category: Category, area: Area): Promise<CaseMatch | null> {
  const res = await db.execute<{ id: string; sim: number }>(sql`
    select id, similarity(claim_en, ${claimEn}) as sim
    from claim_case
    where status = 'verifying'
      and category = ${category}
      and (
        (${area.puId}::uuid is not null and pu_id = ${area.puId}::uuid)
        or (ward_id is not distinct from ${area.wardId}::uuid and similarity(claim_en, ${claimEn}) >= ${MATCH_THRESHOLD})
      )
    order by sim desc, created_at desc
    limit 1`);
  const row = res.rows[0];
  return row ? { id: row.id, similarity: Number(row.sim) } : null;
}
