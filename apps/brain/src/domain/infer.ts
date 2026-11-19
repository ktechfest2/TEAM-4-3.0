/**
 * Backup for verification calls: if the official clearly answered but the voice agent failed to call
 * record_verifier_answer, infer yes/no/unknown from what the OFFICIAL said (never from Confam's own lines).
 * Conservative: the last caller turn with a clear signal wins; a turn with both yes and no signals is ignored.
 */
export type Inferred = { answer: "yes" | "no" | "unknown"; evidence: string } | null;

interface Turn {
  role?: string;
  speaker?: string;
  content?: string;
  text?: string;
  message?: string;
}

const CALLER_ROLES = /^(user|caller|human|customer|callee|contact)$/i;
const UNKNOWN = /\b(i\s*don'?t\s*know|i\s*no\s*know|not\s*sure|no\s*idea|can'?t\s*(see|tell)|i'?m\s*not\s*there|i\s*no\s*dey\s*there|busy|call\s*(me\s*)?(back|later))\b/i;
const NO = /\b(no|nope|not\s*true|no\s*be\s*true|e\s*no\s*true|false|nothing\s*like\s*that|nothing\s*(dey|is)\s*happening|everything\s*(is\s*)?calm|e\s*calm|it'?s\s*calm|not\s*happening|lie|rara|ba\s*gaskiya\s*ba(?:\s*ne)?)\b/i;
const YES = /\b(yes|yeah|yep|it\s*is|it'?s\s*true|na\s*true|e\s*true|(?<!\bno\s)(?<!\bnot\s)(?<!\bno\sbe\s)true|correct|that'?s\s*right|e\s*dey\s*happen|dem\s*dey|gaskiya\s*ne|ee|bẹ́?ẹ̀?\s*ni)\b/i;

export function inferVerifierAnswer(transcript: unknown): Inferred {
  if (!Array.isArray(transcript)) return null;
  const said = (transcript as Turn[])
    .filter((t) => CALLER_ROLES.test(String(t.role ?? t.speaker ?? "")))
    .map((t) => String(t.content ?? t.text ?? t.message ?? "").trim())
    .filter(Boolean);
  for (let i = said.length - 1; i >= 0; i--) {
    const line = said[i]!;
    if (UNKNOWN.test(line)) return { answer: "unknown", evidence: line };
    const no = NO.test(line);
    const yes = YES.test(line);
    if (no && !yes) return { answer: "no", evidence: line };
    if (yes && !no) return { answer: "yes", evidence: line };
  }
  return null;
}
