"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";

const ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/rumours", label: "Rumours" },
  { href: "/units", label: "Polling units" },
  { href: "/people", label: "People" },
  { href: "/calls", label: "Calls" },
  { href: "/settings", label: "Settings" },
] as const;

export function Nav({ openCases }: { openCases: number }) {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav aria-label="Control room" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
      {ITEMS.map((it) => {
        const on = active(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={on ? "page" : undefined}
            className="relative flex shrink-0 items-center justify-between gap-3 rounded-[6px] px-3 py-2 text-[15px] font-medium transition-colors duration-200"
            style={{ color: on ? "var(--accent-ink)" : "var(--ink)" }}
          >
            {on && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-[6px] bg-accent" transition={{ type: "spring", duration: 0.35, bounce: 0.1 }} />}
            <span className="relative">{it.label}</span>
            {it.href === "/rumours" && openCases > 0 && (
              <span className="relative rounded-full px-2 text-xs font-bold leading-5" style={{ background: on ? "var(--accent-ink)" : "var(--warn)", color: on ? "var(--accent)" : "var(--surface)" }}>
                {openCases}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
