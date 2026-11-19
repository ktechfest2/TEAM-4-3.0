"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

export interface FeedEntry {
  id: string;
  at: string;
  title: string;
  detail: string;
  tone: "neutral" | "good" | "bad" | "warn" | "ink";
  href?: string;
}

const COLOR = { neutral: "var(--neutral)", good: "var(--good)", bad: "var(--bad)", warn: "var(--warn)", ink: "var(--violet)" } as const;

function lagos(iso: string) {
  return new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Lagos" }).format(new Date(iso));
}

/** Activity log: new entries slide in from the top edge; the first load staggers once, later updates don't replay. */
export function Feed({ items }: { items: FeedEntry[] }) {
  // Entries present on first render stagger in once; anything that arrives later slides in from the top edge.
  const [initialIds] = useState(() => new Set(items.map((i) => i.id)));

  if (items.length === 0) {
    return <p className="px-5 py-10 text-center text-muted">Nothing yet. Calls, rumours and check-ins appear here the moment they happen.</p>;
  }
  return (
    <ol className="divide-y divide-line">
      <AnimatePresence initial={false}>
        {items.map((it, i) => {
          const isNew = !initialIds.has(it.id);
          const body = (
            <div className="grid grid-cols-[3.25rem_1fr] gap-3 px-5 py-3">
              <time className="pt-0.5 font-mono text-[13px] text-muted" dateTime={it.at}>{lagos(it.at)}</time>
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-semibold">
                  <span aria-hidden className="inline-block h-3 w-1 rounded-sm" style={{ background: COLOR[it.tone] }} />
                  <span className="truncate">{it.title}</span>
                </p>
                <p className="truncate text-[15px] text-muted">{it.detail}</p>
              </div>
            </div>
          );
          return (
            <motion.li
              key={it.id}
              layout="position"
              initial={isNew ? { opacity: 0, y: -12 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1], delay: isNew ? 0 : Math.min(i, 10) * 0.035 }}
              className={isNew ? "fresh" : undefined}
            >
              {it.href ? (
                <Link href={it.href} className="block transition-colors duration-200 hover:bg-surface-2">
                  {body}
                </Link>
              ) : (
                body
              )}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
