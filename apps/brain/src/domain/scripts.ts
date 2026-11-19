/**
 * Everything Confam says about verdicts and alerts comes from these templates (never free LLM text),
 * so the agent can only repeat what the system actually decided. English + Nigerian Pidgin.
 */
import type { Verdict } from "./verdict.ts";

export type Category =
  | "violence"
  | "vote_buying"
  | "pu_relocated"
  | "officials_absent"
  | "materials_missing"
  | "election_postponed"
  | "result_tampering"
  | "other";

export const CATEGORIES: readonly Category[] = [
  "violence",
  "vote_buying",
  "pu_relocated",
  "officials_absent",
  "materials_missing",
  "election_postponed",
  "result_tampering",
  "other",
];

/** Categories where a confirmed or debunked verdict is also pushed to subscribers in the area. */
export const SAFETY_CATEGORIES: ReadonlySet<Category> = new Set(["violence", "election_postponed"]);

export interface Bilingual {
  en: string;
  pcm: string;
}

export function placeName(raw: string): string {
  return raw
    .toLowerCase()
    .split(/([\s/-]+)/)
    .map((w) => (/^[a-z]/.test(w) ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join("")
    .replace(/\//g, " / ");
}

const SAFETY_EN = " If you feel unsafe, move away from the area and call 112.";
const SAFETY_PCM = " If you no feel safe, comot from that area and call 112.";

export function verdictScript(params: {
  verdict: Verdict;
  category: Category;
  claimEn: string;
  place: string;
  yes: number;
  no: number;
  /** who settled it, e.g. "the presiding officer at Ojuelegba Primary School I" or "INEC" */
  source?: string | null;
}): Bilingual {
  const { verdict, category, claimEn, place } = params;
  const people = verdict === "confirmed" ? params.yes : params.no;
  const srcEn = params.source ? (params.source === "INEC" ? "INEC officials told us directly." : `${params.source.charAt(0).toUpperCase()}${params.source.slice(1)} told us directly.`) : `${people} ${people === 1 ? "person" : "people"} at the location told us so directly.`;
  const srcPcm = params.source ? (params.source === "INEC" ? "INEC officials confam am give us." : `${params.source.replace(/^the /, "The ")} confam am give us.`) : `${people} ${people === 1 ? "person" : "people"} wey dey that place confam am give us.`;
  const safety = category === "violence";
  const claim = claimEn.replace(/[.\s]+$/, "");
  switch (verdict) {
    case "false":
      return {
        en: `Confam check: the report that "${claim}" around ${place} is not true. ${srcEn}${safety ? SAFETY_EN : ""}`,
        pcm: `Confam don check am: the gist say "${claim}" for ${place} no true. ${srcPcm}${safety ? SAFETY_PCM : ""}`,
      };
    case "confirmed":
      return {
        en: `Confam check: the report that "${claim}" around ${place} is true. ${srcEn} Please plan accordingly.${safety ? SAFETY_EN : ""}`,
        pcm: `Confam don check am: the gist say "${claim}" for ${place} na true. ${srcPcm} Abeg plan your movement well.${safety ? SAFETY_PCM : ""}`,
      };
    case "unverified":
      return {
        en: `Confam check: we could not confirm the report that "${claim}" around ${place}. Please treat it with caution, rely on official INEC channels, and stay safe.`,
        pcm: `Confam check: we no fit confam the gist say "${claim}" for ${place}. Abeg no carry am for head, follow wetin INEC talk, and take care of yourself.`,
      };
  }
}

export function correctionPrefix(script: Bilingual): Bilingual {
  return {
    en: `Correction from Confam. ${script.en}`,
    pcm: `Confam wan correct wetin we talk before. ${script.pcm}`,
  };
}

export function relocationScript(p: { oldPu: string; newPu: string; newAddress: string; landmark: string | null }): Bilingual {
  const lm = p.landmark ? ` (${p.landmark})` : "";
  return {
    en: `Important notice from Confam on behalf of INEC: your polling unit has moved from ${p.oldPu} to ${p.newPu}, ${p.newAddress}${lm}. Please vote at the new location.`,
    pcm: `Important message from Confam for INEC: dem don move your polling unit comot from ${p.oldPu} go ${p.newPu}, for ${p.newAddress}${lm}. Abeg go vote for the new place.`,
  };
}

export function goNowScript(p: { pu: string }): Bilingual {
  return {
    en: `Good news from Confam: the officials have arrived at ${p.pu} and they know you are coming. You have the right to priority in the queue and to bring a helper of your choice. You can go and vote now.`,
    pcm: `Good news from Confam: the officials don reach ${p.pu} and dem know say you dey come. You get right to vote first without queue, and you fit carry person wey go help you. You fit go vote now.`,
  };
}

export function verifierQuestion(p: { claimEn: string; place: string }): string {
  return `Is this happening right now around ${p.place}: ${p.claimEn.replace(/[.\s]+$/, "")}?`;
}

export function transferScript(p: { fromPu: string; toPu: string; toAddress: string; landmark: string | null }): Bilingual {
  const lm = p.landmark ? ` (${p.landmark})` : "";
  return {
    en: `Important notice from Confam on behalf of INEC: your voting location has been changed from ${p.fromPu} to ${p.toPu}, ${p.toAddress}${lm}. Please go and vote at the new location.`,
    pcm: `Important message from Confam for INEC: dem don change where you go vote. E no be ${p.fromPu} again, na ${p.toPu}, for ${p.toAddress}${lm}. Abeg go vote for the new place.`,
  };
}
