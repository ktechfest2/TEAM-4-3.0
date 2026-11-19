import { ViewTransition } from "react";

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter="fade-in" exit="fade-out" default="none">
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-6 sm:px-8">{children}</div>
    </ViewTransition>
  );
}

/** Page heading: condensed signage type, big, with an optional live sentence underneath. */
export function Heading({ title, lede, actions }: { title: string; lede?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-[clamp(2.6rem,6vw,4.75rem)] font-bold uppercase leading-[0.88] tracking-[-0.01em]">{title}</h1>
        {lede && <p className="mt-3 max-w-2xl text-lg text-muted">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Panel({ title, children, aside, className = "" }: { title?: string; children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[10px] border border-line bg-surface ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="font-display text-xl font-semibold uppercase tracking-wide">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-5 py-10 text-center">
      <p className="font-display text-2xl font-semibold uppercase text-muted">{title}</p>
      {children && <div className="mx-auto mt-2 max-w-md text-muted">{children}</div>}
    </div>
  );
}

const TONES = {
  good: "var(--good)",
  bad: "var(--bad)",
  warn: "var(--warn)",
  neutral: "var(--neutral)",
  ink: "var(--violet)",
} as const;

export function Tag({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  const c = TONES[tone];
  return (
    <span className="inline-flex items-center rounded-[4px] px-1.5 py-0.5 text-xs font-semibold" style={{ color: c, background: `color-mix(in oklab, ${c} 13%, transparent)` }}>
      {children}
    </span>
  );
}

export function timeAgo(d: Date, now = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function lagosTime(d: Date): string {
  return new Intl.DateTimeFormat("en-NG", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Lagos" }).format(d);
}

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
}

export const CATEGORY_LABEL: Record<string, string> = {
  violence: "Violence",
  vote_buying: "Vote buying",
  pu_relocated: "PU relocated",
  officials_absent: "Officials absent",
  materials_missing: "Materials missing",
  election_postponed: "Postponement",
  result_tampering: "Result tampering",
  other: "Other",
};
