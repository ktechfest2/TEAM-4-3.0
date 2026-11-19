"use client";

import { motion } from "motion/react";

const LABEL = { confirmed: "CONFIRMED", false: "FALSE", unverified: "UNVERIFIED" } as const;
const TONE = { confirmed: "var(--bad)", false: "var(--good)", unverified: "var(--warn)" } as const;

/**
 * Signature element: verdicts land like a rubber stamp on a result sheet.
 * A firm press (scale down from 1.5, slight rotation settle) and an ink ring that spreads once.
 */
export function VerdictStamp({ verdict, size = "md", animate = true }: { verdict: "confirmed" | "false" | "unverified"; size?: "sm" | "md" | "lg"; animate?: boolean }) {
  const color = TONE[verdict];
  const scale = { sm: "text-sm px-2 py-0.5 border-2", md: "text-lg px-3 py-1 border-[3px]", lg: "text-4xl px-5 py-2 border-4" }[size];
  return (
    <span className="relative inline-block" aria-label={`Verdict: ${LABEL[verdict].toLowerCase()}`}>
      <motion.span
        initial={animate ? { scale: 1.5, rotate: -16, opacity: 0 } : false}
        animate={{ scale: 1, rotate: -5, opacity: 1 }}
        transition={{ type: "spring", duration: 0.38, bounce: 0 }}
        className={`inline-block rounded-[4px] font-display font-bold tracking-[0.08em] leading-none ${scale}`}
        style={{ color, borderColor: color, mixBlendMode: "multiply" }}
      >
        {LABEL[verdict]}
      </motion.span>
      {animate && (
        <motion.span
          aria-hidden
          initial={{ opacity: 0.5, scale: 0.9 }}
          animate={{ opacity: 0, scale: 1.35 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
          className="pointer-events-none absolute inset-0 rounded-[6px]"
          style={{ boxShadow: `0 0 0 2px ${color}` }}
        />
      )}
    </span>
  );
}
