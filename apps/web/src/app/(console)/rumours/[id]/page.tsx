import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { OverrideVerdict } from "@/components/override";
import { Page, Panel, Tag, CATEGORY_LABEL, lagosTime, timeAgo, titleCase } from "@/components/ui";
import { VerdictStamp } from "@/components/verdict-stamp";
import { getCase, mask } from "@/lib/server/data";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Rumour" };

const STATUS_TONE = { pending: "neutral", calling: "ink", answered: "good", no_answer: "warn", skipped: "neutral", failed: "bad" } as const;
const STATUS_LABEL = { pending: "Queued", calling: "On the phone", answered: "Answered", no_answer: "No answer", skipped: "Simulated (demo contact)", failed: "Call failed" } as const;
const ALERT_LABEL: Record<string, string> = { pending: "Queued", calling: "Calling", delivered: "Delivered", heard: "Heard and confirmed", no_answer: "No answer", skipped: "Not dialled", failed: "Failed" };

export default async function RumourDetail({ params }: PageProps<"/rumours/[id]">) {
  const { id } = await params;
  const [data, user] = await Promise.all([getCase(id), requireUser()]);
  if (!data) notFound();
  const { c, reports, requests, facts, alerts } = data;
  const current = facts.find((f) => !f.supersededAt);
  const place = data.pu ?? titleCase(data.ward ?? "Unknown area");

  return (
    <Page>
      <Link href="/rumours" className="link-u text-sm font-semibold text-muted">Back to rumours</Link>
      <header className="mb-8 mt-3 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Tag tone={c.category === "violence" ? "bad" : "neutral"}>{CATEGORY_LABEL[c.category]}</Tag>
            <span>{place}</span>
            <span>reported {timeAgo(c.createdAt)}</span>
          </div>
          <h1 className="mt-3 max-w-4xl font-display text-[clamp(2rem,4.6vw,3.6rem)] font-bold uppercase leading-[0.92]">{c.claimEn}</h1>
          {c.basis && <p className="mt-4 max-w-2xl text-lg text-muted">{c.basis}</p>}
        </div>
        <div className="lg:pt-4">
          {c.status === "published" && c.verdict ? (
            <VerdictStamp verdict={c.verdict} size="lg" />
          ) : (
            <div className="rounded-[10px] border border-line bg-surface px-5 py-4">
              <p className="font-display text-2xl font-bold uppercase text-warn">Checking</p>
              <p className="text-sm text-muted">Deadline {lagosTime(c.deadlineAt)} (Lagos). Verdict lands automatically when 2+ verifiers agree.</p>
            </div>
          )}
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Panel title="Verifiers called" aside={<span className="text-sm text-muted">{requests.filter((r) => r.status === "answered").length} of {requests.length} answered</span>}>
            {requests.length === 0 ? (
              <p className="px-5 py-6 text-muted">No verifiers yet. They are chosen from the ward first, then the rest of the LGA.</p>
            ) : (
              <ul className="divide-y divide-line">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="font-semibold">{r.name} <span className="font-mono text-sm font-normal text-muted">{mask(r.last4)}</span></p>
                      <p className="text-sm text-muted">
                        {r.affiliation ? titleCase(r.affiliation.replace("_", " ")) : "Unaffiliated"}, weight {r.weight.toFixed(1)}
                        {r.attempts > 1 ? `, ${r.attempts} attempts` : ""}
                      </p>
                      {r.detail && <p className="mt-1 text-[15px]">&ldquo;{r.detail}&rdquo;</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {r.answer && <Tag tone={r.answer === "yes" ? "bad" : r.answer === "no" ? "good" : "neutral"}>Said {r.answer}</Tag>}
                      <Tag tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Tag>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="What callers said">
            <ul className="divide-y divide-line">
              {reports.map((r) => (
                <li key={r.id} className="px-5 py-4">
                  <p className="text-sm text-muted">
                    {lagosTime(r.at)}, {r.name ?? "Caller"} {r.last4 ? <span className="font-mono">{mask(r.last4)}</span> : null}
                  </p>
                  <p className="mt-1 font-medium">{r.claim}</p>
                  {r.raw && r.raw !== r.claim && <p className="mt-1 text-[15px] text-muted" lang="und">Heard: &ldquo;{r.raw}&rdquo;</p>}
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="space-y-6">
          {current && (
            <Panel title="What Confam tells callers">
              <div className="space-y-4 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-muted">Pidgin</p>
                  <p className="mt-1 text-[17px] leading-relaxed">{current.scriptPcm}</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-muted">English</p>
                  <p className="mt-1 text-[17px] leading-relaxed">{current.scriptEn}</p>
                </div>
                <p className="text-sm text-muted">Valid until {lagosTime(current.validUntil)} (Lagos). After that, new reports are checked again.</p>
              </div>
            </Panel>
          )}
          {alerts.length > 0 && (
            <Panel title="Callbacks">
              <ul className="divide-y divide-line">
                {alerts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0 truncate">{a.name} <span className="font-mono text-sm text-muted">{mask(a.last4)}</span></span>
                    <Tag tone={a.status === "heard" || a.status === "delivered" ? "good" : a.status === "failed" ? "bad" : "neutral"}>
                      {a.isDemo && a.status === "skipped" ? "Simulated (demo contact)" : ALERT_LABEL[a.status]}
                    </Tag>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <Panel title="Set the verdict">
            <div className="px-5 py-4">
              <OverrideVerdict caseId={c.id} current={c.verdict} canEdit={user.role === "admin"} />
              {c.overriddenBy && <p className="mt-3 text-sm text-violet">Last set by {c.overriddenBy}.</p>}
            </div>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
