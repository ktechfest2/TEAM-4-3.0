"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, useSyncExternalStore, useTransition } from "react";
import { setOutboundPaused } from "@/lib/server/actions";

/** The big physical-feeling switch: when paused, the dialer refuses every outbound call. */
export function PauseSwitch({ paused: initial, canEdit }: { paused: boolean; canEdit: boolean }) {
  const [paused, setPaused] = useState(initial);
  const [lastInitial, setLastInitial] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Adopt server changes (e.g. another admin paused) without an effect.
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setPaused(initial);
  }

  const toggle = () =>
    start(async () => {
      const next = !paused;
      setPaused(next);
      setError(null);
      try {
        const res = await setOutboundPaused(next);
        if (!res?.ok) throw new Error(res?.message);
      } catch (err) {
        setPaused(!next);
        setError((err as Error).message || "Could not change outbound calls.");
      }
    });

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={!paused}
        aria-label={paused ? "Outbound calls paused. Resume outbound calls" : "Outbound calls live. Pause all outbound calls"}
        disabled={!canEdit || pending}
        onClick={toggle}
        className="btn group relative h-10 overflow-hidden px-1 py-1 disabled:cursor-not-allowed"
        style={{ background: paused ? "var(--bad)" : "var(--surface-2)", width: 196 }}
      >
        <motion.span
          layout
          transition={{ type: "spring", duration: 0.3, bounce: 0 }}
          className="relative z-10 flex h-8 w-[94px] items-center justify-center rounded-[4px] font-display text-[15px] font-bold tracking-wide"
          style={{ marginLeft: paused ? 94 : 0, background: paused ? "var(--surface)" : "var(--accent)", color: paused ? "var(--bad)" : "var(--accent-ink)" }}
        >
          {paused ? "PAUSED" : "LIVE"}
        </motion.span>
        <span className="absolute inset-y-0 flex items-center font-display text-[13px] font-semibold tracking-wide" style={{ left: paused ? 18 : 118, color: paused ? "var(--surface)" : "var(--muted)" }}>
          {paused ? "RESUME" : "PAUSE ALL"}
        </span>
      </button>
      <span className="hidden text-sm text-muted xl:inline">Outbound calls</span>
      <AnimatePresence>
        {error && (
          <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-sm text-bad">
            {error}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function subscribeMinute(cb: () => void) {
  const t = setInterval(cb, 15_000);
  return () => clearInterval(t);
}
const minuteSnapshot = () => Math.floor(Date.now() / 60_000);
const serverSnapshot = () => null;

export function LagosClock() {
  const minute = useSyncExternalStore(subscribeMinute, minuteSnapshot, serverSnapshot);
  const now = minute === null ? null : new Date(minute * 60_000);
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Lagos" }).format(d);
  const day = (d: Date) => new Intl.DateTimeFormat("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" }).format(d);
  return (
    <span className="flex items-baseline gap-2">
      <span className="font-display text-2xl font-semibold leading-none">{now ? fmt(now) : "--:--"}</span>
      <span className="text-sm text-muted">{now ? `${day(now)}, Lagos` : "Lagos"}</span>
    </span>
  );
}
