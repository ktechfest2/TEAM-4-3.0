"use client";

import { motion } from "motion/react";

export interface WardTileData {
  id: string;
  name: string;
  units: number;
  openCases: number;
  arrived: number;
  withOfficials: number;
  subscribers: number;
}

function title(s: string) {
  return s.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase()).replace(/\//g, " / ");
}

/** 12 wards laid out like polling-unit signboards. Status bar fills to officials-arrived share. */
export function WardBoard({ wards, electionDay }: { wards: WardTileData[]; electionDay: boolean }) {
  return (
    <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-3 xl:grid-cols-4">
      {wards.map((w, i) => {
        const share = w.withOfficials > 0 ? w.arrived / w.withOfficials : 0;
        const late = electionDay && w.withOfficials > 0 && w.arrived < w.withOfficials;
        return (
          <motion.li
            key={w.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: 0.04 * i }}
            className="relative bg-surface p-4"
          >
            <p className="font-mono text-[11px] text-muted">LA-SUR-{String(i + 1).padStart(2, "0")}</p>
            <p className="mt-1 min-h-[2.6em] font-display text-[1.15rem] font-semibold uppercase leading-[1.05]">{title(w.name)}</p>
            <div className="mt-3 flex items-end justify-between gap-2 text-sm">
              <span className="text-muted">{w.units} PU{w.units === 1 ? "" : "s"}</span>
              {w.openCases > 0 ? (
                <span className="rounded-[4px] bg-warn px-1.5 font-semibold text-surface">{w.openCases} checking</span>
              ) : (
                <span className="text-muted">{w.subscribers} subscribed</span>
              )}
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-label={`${w.arrived} of ${w.withOfficials} units with officials arrived`}>
              <motion.div
                className="h-full origin-left rounded-full"
                style={{ background: late ? "var(--warn)" : "var(--good)" }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: w.withOfficials ? Math.max(share, 0.02) : 0 }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.2 + 0.04 * i }}
              />
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}
