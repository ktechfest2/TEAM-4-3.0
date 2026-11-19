import Link from "next/link";
import type { Metadata } from "next";
import { Heading, Page, Panel, Tag, CATEGORY_LABEL, lagosTime, timeAgo, titleCase } from "@/components/ui";
import { VerdictStamp } from "@/components/verdict-stamp";
import { eventLabel, getSettings, getSituation } from "@/lib/server/data";

export const metadata: Metadata = { title: "Situation board" };

export default async function Situation() {
  const [{ facts, open, checkins }, settings] = await Promise.all([getSituation(), getSettings()]);
  return (
    <Page>
      <Heading
        title="Situation board"
        lede={`What Confam knows right now. Every caller who asks about these gets the answer instantly, without new calls. Verdicts are reused for ${settings.factValidHours} hour${settings.factValidHours === 1 ? "" : "s"}; officials' check-ins are always read out with their time.`}
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Verified answers in memory" aside={<span className="text-sm text-muted">{facts.length}</span>}>
          {facts.length === 0 ? (
            <p className="px-5 py-6 text-muted">Nothing verified yet. When someone reports a rumour, Confam asks the official at that polling unit and the answer lands here.</p>
          ) : (
            <ul className="divide-y divide-line">
              {facts.map((f) => (
                <li key={f.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <Link href={f.caseId ? `/rumours/${f.caseId}` : "/rumours"} className="link-u font-semibold">{f.claim}</Link>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
                        <Tag tone={f.category === "violence" ? "bad" : "neutral"}>{CATEGORY_LABEL[f.category]}</Tag>
                        {f.pu ?? titleCase(f.ward ?? "")}, verified {timeAgo(f.createdAt)}, reused until {lagosTime(f.validUntil)}
                      </p>
                    </div>
                    <VerdictStamp verdict={f.verdict} size="sm" animate={false} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="space-y-6">
          <Panel title="Officials' latest check-ins">
            {checkins.length === 0 ? (
              <p className="px-5 py-6 text-muted">No check-ins today. Callers asking whether officials have arrived will hear that none has reported yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {checkins.map((c) => (
                  <li key={c.pu_id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span>
                      <span className="font-semibold">{c.name}</span> <span className="font-mono text-sm text-muted">{c.code}</span>
                      {c.note && <span className="block text-sm text-muted">{c.note}</span>}
                    </span>
                    <span className="text-right text-[15px]">
                      <Tag tone={c.event === "delay" || c.event === "issue" ? "warn" : "good"}>{eventLabel(c.event)}</Tag>
                      <span className="block text-sm text-muted">{lagosTime(c.at)}{c.eta_minutes ? `, ETA ${c.eta_minutes} min` : ""}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Being checked now">
            {open.length === 0 ? (
              <p className="px-5 py-6 text-muted">No open checks.</p>
            ) : (
              <ul className="divide-y divide-line">
                {open.map((c) => (
                  <li key={c.id}>
                    <Link href={`/rumours/${c.id}`} className="block px-5 py-3 transition-colors duration-200 hover:bg-surface-2">
                      <span className="font-semibold">{c.claim}</span>
                      <span className="block text-sm text-muted">{c.pu ?? titleCase(c.ward ?? "")}, asked {c.asked}, answered {c.answered}, deadline {lagosTime(c.deadlineAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </Page>
  );
}
