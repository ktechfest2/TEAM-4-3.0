import { sql } from "drizzle-orm";
import type { Db } from "@confam/db";

export interface PuInfo {
  id: string;
  code: string;
  name: string;
  address: string;
  landmark: string | null;
  status: "active" | "relocated";
  wardId: string;
  wardName: string;
  relocatedTo: { code: string; name: string; address: string; landmark: string | null } | null;
  score: number;
}

export interface ResolvedPlace {
  wardId: string | null;
  wardName: string | null;
  pu: PuInfo | null;
  label: string;
}

const PU_THRESHOLD = 0.3;
const WARD_THRESHOLD = 0.3;

/** Fuzzy polling-unit search by code, name, address or landmark (speech transcripts are messy). */
export async function searchPollingUnits(db: Db, query: string, limit = 3): Promise<PuInfo[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const res = await db.execute<{
    id: string;
    code: string;
    name: string;
    address: string;
    landmark: string | null;
    status: "active" | "relocated";
    ward_id: string;
    ward_name: string;
    r_code: string | null;
    r_name: string | null;
    r_address: string | null;
    r_landmark: string | null;
    score: number;
  }>(sql`
    select pu.id, pu.code, pu.name, pu.address, pu.landmark, pu.status, pu.ward_id, w.name as ward_name,
           r.code as r_code, r.name as r_name, r.address as r_address, r.landmark as r_landmark,
           greatest(
             case when lower(pu.code) = ${q} then 1.0 else 0 end,
             word_similarity(${q}, lower(pu.name)),
             word_similarity(${q}, lower(pu.address)) * 0.8,
             word_similarity(${q}, lower(coalesce(pu.landmark, ''))) * 0.6,
             word_similarity(${q}, lower(w.name)) * 0.5
           ) as score
    from polling_unit pu
    join ward w on w.id = pu.ward_id
    left join polling_unit r on r.id = pu.relocated_to_id
    order by score desc, pu.code
    limit ${limit}`);
  return res.rows
    .filter((r) => Number(r.score) >= PU_THRESHOLD)
    .map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      address: r.address,
      landmark: r.landmark,
      status: r.status,
      wardId: r.ward_id,
      wardName: r.ward_name,
      relocatedTo: r.r_code ? { code: r.r_code, name: r.r_name!, address: r.r_address!, landmark: r.r_landmark } : null,
      score: Number(r.score),
    }));
}

export async function searchWard(db: Db, query: string): Promise<{ id: string; name: string } | null> {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const res = await db.execute<{ id: string; name: string; score: number }>(sql`
    select id, name, greatest(
      word_similarity(${q}, lower(name)),
      (select max(word_similarity(${q}, part)) from unnest(string_to_array(lower(name), '/')) as part)
    ) as score
    from ward order by score desc limit 1`);
  const row = res.rows[0];
  return row && Number(row.score) >= WARD_THRESHOLD ? { id: row.id, name: row.name } : null;
}

/** Resolve a spoken place ("Ojuelegba", "the stadium", "LA-SUR-05-001") to a PU and/or ward. */
export async function resolvePlace(db: Db, hint: string): Promise<ResolvedPlace> {
  const [pu] = await searchPollingUnits(db, hint, 1);
  const ward = await searchWard(db, hint);
  // Prefer the PU only when it is a strong match; otherwise the ward is the safer scope.
  if (pu && pu.score >= 0.6) return { wardId: pu.wardId, wardName: pu.wardName, pu, label: pu.name };
  if (ward) return { wardId: ward.id, wardName: ward.name, pu: null, label: ward.name };
  if (pu) return { wardId: pu.wardId, wardName: pu.wardName, pu, label: pu.name };
  return { wardId: null, wardName: null, pu: null, label: hint.trim() };
}
