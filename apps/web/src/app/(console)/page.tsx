import Link from "next/link";
import type { Metadata } from "next";
import { Feed } from "@/components/feed";
import { Page, Panel, Tag, CATEGORY_LABEL, timeAgo, titleCase } from "@/components/ui";
import { VerdictStamp } from "@/components/verdict-stamp";
import { WardBoard } from "@/components/ward-board";
import { getCounters, getFeed, getSettings, getWardBoard, listCases } from "@/lib/server/data";

export const metadata: Metadata = { title: "Overview" };

export default async function Overview() {
  const [counters, feed, wards, cases, settings] = await Promise.all([getCounters(), getFeed(), getWardBoard(), listCases(), getSettings()]);
  const open = cases.filter((c) => c.status === "verifying");
  const recent = cases.filter((c) => c.status === "published").slice(0, 4);
  const sentence =
    counters.open === 0
      ? "No rumours are being checked right now."
      : `${counters.open} rumour${counters.open === 1 ? " is" : "s are"} being checked with verifiers on the ground.`;

  return (
    <Page>
      <section className="mb-10 grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div>
          <p className="font-medium text-muted">Surulere LGA, Lagos</p>
          <h1 className="mt-2 font-display text-[clamp(3rem,8.5vw,7.5rem)] font-extrabold uppercase leading-[0.84] tracking-[-0.02em]">
            {counters.open > 0 ? (
              <>
                <span className="text-warn">{counters.open}</span> under check
              </>
            ) : (
              <>All clear</>
            )}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">{sentence} Confam answers voters on the phone and calls them back with every verdict.</p>
        </div>
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[10px] border border-line bg-line text-center">
          {[
            ["Calls in (24h)", counters.inboundCalls],
            ["Calls out (24h)", counters.outboundDialled],
            ["Subscribed voters", counters.subscribers],
          ].map(([label, n]) => (
            <div key={label} className="bg-surface px-3 py-4">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="mt-1 font-display text-4xl font-bold leading-none">{n}</dd>
            </div>
          ))}
          {counters.outboundFailed > 0 && (
            <div className="col-span-3 bg-surface px-3 py-2 text-sm text-bad">
              {counters.outboundFailed} outbound call{counters.outboundFailed === 1 ? "" : "s"} failed in the last 24h. <Link className="link-u font-semibold" href="/calls">See why</Link>
            </div>
          )}
        </dl>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-6">
          <Panel title="Rumours being checked" aside={<Link href="/rumours" className="link-u text-sm font-semibold">All rumours</Link>}>
            {open.length === 0 ? (
              <p className="px-5 py-8 text-muted">When a voter reports something Confam hasn&apos;t verified, it appears here while verifiers are called.</p>
            ) : (
              <ul className="divide-y divide-line">
                {open.map((c) => (
                  <li key={c.id}>
                    <Link href={`/rumours/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors duration-200 hover:bg-surface-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{c.claim}</p>
                        <p className="text-sm text-muted">
                          {c.pu ?? titleCase(c.ward ?? "")}, {timeAgo(c.createdAt)}, {c.reports} report{c.reports === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Tag tone="warn">{CATEGORY_LABEL[c.category]}</Tag>
                        <span className="font-mono text-sm text-muted">{c.answered}/{c.asked} answered</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div>
            <h2 className="mb-3 font-display text-xl font-semibold uppercase tracking-wide">Wards</h2>
            <WardBoard wards={wards} electionDay={settings.electionDay} />
          </div>

          {recent.length > 0 && (
            <Panel title="Latest verdicts">
              <ul className="divide-y divide-line">
                {recent.map((c) => (
                  <li key={c.id}>
                    <Link href={`/rumours/${c.id}`} className="flex items-center justify-between gap-4 px-5 py-4 transition-colors duration-200 hover:bg-surface-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{c.claim}</p>
                        <p className="text-sm text-muted">{c.pu ?? titleCase(c.ward ?? "")}{c.publishedAt ? `, ${timeAgo(c.publishedAt)}` : ""}</p>
                      </div>
                      {c.verdict && <VerdictStamp verdict={c.verdict} size="sm" animate={false} />}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <Panel title="Live activity" className="self-start xl:sticky xl:top-24">
          <Feed items={feed.map((f) => ({ ...f, at: f.at.toISOString() }))} />
        </Panel>
      </div>
    </Page>
  );
}
