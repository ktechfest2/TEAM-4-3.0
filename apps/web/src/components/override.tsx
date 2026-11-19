"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, useTransition } from "react";
import { overrideVerdict } from "@/lib/server/actions";

const OPTIONS = [
  { v: "false", label: "False", hint: "It is not happening" },
  { v: "confirmed", label: "Confirmed", hint: "It is happening" },
  { v: "unverified", label: "Unverified", hint: "Can't be confirmed" },
] as const;

export function OverrideVerdict({ caseId, current, canEdit }: { caseId: string; current: string | null; canEdit: boolean }) {
  const [choice, setChoice] = useState<(typeof OPTIONS)[number]["v"] | null>(null);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  if (!canEdit) return <p className="text-sm text-muted">Only admins can change a verdict.</p>;
  return (
    <div>
      <p className="mb-3 text-[15px] text-muted">
        Know better from official sources? Set the verdict yourself. Everyone who reported it gets a correction call, and verifier reputations update.
      </p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="New verdict">
        {OPTIONS.map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={choice === o.v}
            disabled={o.v === current}
            onClick={() => setChoice(o.v)}
            className={`btn ${choice === o.v ? "btn-violet" : "btn-quiet"} flex-col items-start gap-0 text-left`}
          >
            <span>{o.label}</span>
            <span className="text-xs font-normal opacity-80">{o.v === current ? "Current verdict" : o.hint}</span>
          </button>
        ))}
      </div>
      <AnimatePresence>
        {choice && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }} className="overflow-hidden">
            <button
              type="button"
              className="btn btn-violet mt-3"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await overrideVerdict(caseId, choice);
                  setResult(r);
                  if (r?.ok) setChoice(null);
                })
              }
            >
              {pending ? "Setting verdict…" : `Set verdict to ${choice} and call reporters`}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {result && (
        <motion.p
          key={result.message}
          initial={{ opacity: 0, x: result.ok ? 0 : -6 }}
          animate={result.ok ? { opacity: 1 } : { opacity: 1, x: [0, -6, 6, -3, 3, 0] }}
          transition={{ duration: 0.3 }}
          className={`mt-3 text-sm font-medium ${result.ok ? "text-good" : "text-bad"}`}
          role="status"
        >
          {result.message}
        </motion.p>
      )}
    </div>
  );
}
