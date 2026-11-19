/**
 * The verdict rule. Pure and deterministic so it can be unit-tested exhaustively.
 * See ARCHITECTURE.md §7 "Verdict rule".
 */

export type Answer = "yes" | "no" | "unknown";
export type Verdict = "confirmed" | "false" | "unverified";

export interface VerifierAnswer {
  personId: string;
  answer: Answer;
  weight: number;
  /** e.g. "party_a"; answers sharing an affiliation are capped per side */
  affiliation: string | null;
}

export interface VerdictRule {
  minAnswers: number;
  threshold: number;
  /** maximum answers counted per side from one affiliation */
  maxPerAffiliation: number;
}

export const DEFAULT_RULE: VerdictRule = { minAnswers: 2, threshold: 0.7, maxPerAffiliation: 2 };

export interface VerdictResult {
  verdict: Verdict | null;
  /** weighted share of the winning side among yes/no answers; null if no decisive answers */
  confidence: number | null;
  yes: number;
  no: number;
  unknown: number;
  final: boolean;
}

/** Only these affiliations are capped (partisan sources). Community/observer/faith answers are not capped. */
const CAPPED_PREFIX = "party_";

export function countable(answers: VerifierAnswer[], rule: VerdictRule): VerifierAnswer[] {
  const seen = new Set<string>();
  const perSide = new Map<string, number>();
  const out: VerifierAnswer[] = [];
  for (const a of answers) {
    if (seen.has(a.personId)) continue;
    seen.add(a.personId);
    if (a.answer === "unknown") {
      out.push(a);
      continue;
    }
    if (a.affiliation?.startsWith(CAPPED_PREFIX)) {
      const key = `${a.affiliation}:${a.answer}`;
      const n = perSide.get(key) ?? 0;
      if (n >= rule.maxPerAffiliation) continue;
      perSide.set(key, n + 1);
    }
    out.push(a);
  }
  return out;
}

/**
 * @param deadlinePassed when true and no side wins, returns `unverified` (final).
 * When false and no side wins yet, returns verdict null (keep waiting).
 */
export function decideVerdict(answers: VerifierAnswer[], deadlinePassed: boolean, rule: VerdictRule = DEFAULT_RULE): VerdictResult {
  const valid = countable(answers, rule);
  let yes = 0;
  let no = 0;
  let unknown = 0;
  let yesW = 0;
  let noW = 0;
  for (const a of valid) {
    const w = Math.max(0, a.weight);
    if (a.answer === "yes") {
      yes++;
      yesW += w;
    } else if (a.answer === "no") {
      no++;
      noW += w;
    } else unknown++;
  }
  const total = yesW + noW;
  const yesShare = total > 0 ? yesW / total : 0;
  const noShare = total > 0 ? noW / total : 0;

  if (yes >= rule.minAnswers && yesShare >= rule.threshold) {
    return { verdict: "confirmed", confidence: round(yesShare), yes, no, unknown, final: true };
  }
  if (no >= rule.minAnswers && noShare >= rule.threshold) {
    return { verdict: "false", confidence: round(noShare), yes, no, unknown, final: true };
  }
  if (deadlinePassed) {
    return { verdict: "unverified", confidence: total > 0 ? round(Math.max(yesShare, noShare)) : null, yes, no, unknown, final: true };
  }
  return { verdict: null, confidence: total > 0 ? round(Math.max(yesShare, noShare)) : null, yes, no, unknown, final: false };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Reputation update once the truth is settled (e.g. by override): agreeing verifiers gain, others lose. Bounded [0.2, 2]. */
export function updatedReputation(current: number, agreed: boolean): number {
  const next = agreed ? current + 0.1 : current - 0.2;
  return Math.min(2, Math.max(0.2, Math.round(next * 100) / 100));
}
