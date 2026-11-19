import type { Metadata } from "next";
import { Transcript } from "@/components/transcript";
import { Empty, Heading, Page, Panel, Tag, lagosTime, timeAgo } from "@/components/ui";
import { decisionLabel, listCalls, mask, outboundLabel } from "@/lib/server/data";

export const metadata: Metadata = { title: "Calls" };

const AGENT_LABEL: Record<string, string> = { hotline: "Hotline", verifier: "Verifier call", alert: "Alert call", official: "Official call" };

export default async function Calls() {
  const { calls, attempts } = await listCalls();
  const minutes = Math.round(calls.reduce((s, c) => s + (c.durationS ?? 0), 0) / 60);
  return (
    <Page>
      <Heading title="Calls" lede={`Every call through Confam, with transcripts. ${calls.length} recent calls, about ${minutes} minutes in total. Outbound decisions show exactly why a call was or wasn't placed.`} />
      <div className="grid gap-6 2xl:grid-cols-[1.5fr_1fr]">
        <Panel title="Recent calls">
          {calls.length === 0 ? (
            <Empty title="No calls yet">Call the Confam line from a phone. The call shows up here when it ends, with its transcript.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {calls.map((c) => (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {c.agent ? AGENT_LABEL[c.agent] ?? c.agent : "Call"}{" "}
                      <span className="font-normal text-muted">
                        {c.direction === "inbound" ? "from" : "to"} {c.name ?? "unknown"} {c.last4 ? <span className="font-mono">{mask(c.last4)}</span> : null}
                      </span>
                    </p>
                    <span className="flex items-center gap-2 text-sm text-muted">
                      {c.durationS != null && <span className="font-mono">{Math.floor(c.durationS / 60)}:{String(c.durationS % 60).padStart(2, "0")}</span>}
                      <Tag tone={c.status === "completed" ? "good" : c.status === "failed" ? "bad" : "neutral"}>{c.status ?? "in progress"}</Tag>
                      <time dateTime={c.createdAt.toISOString()}>{lagosTime(c.createdAt)}</time>
                    </span>
                  </div>
                  <div className="mt-2">
                    <Transcript transcript={c.transcript} text={c.transcriptText} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Outbound decisions" className="self-start">
          {attempts.length === 0 ? (
            <Empty title="Nothing dialled yet" />
          ) : (
            <ul className="divide-y divide-line">
              {attempts.map((a) => (
                <li key={a.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{outboundLabel(a.purpose)}</p>
                    <span className="text-sm text-muted">{timeAgo(a.at)}</span>
                  </div>
                  <p className="text-sm text-muted">
                    {a.name ?? "Unknown"} {a.last4 ? <span className="font-mono">{mask(a.last4)}</span> : null}:{" "}
                    <span className={a.decision === "error" ? "text-bad" : a.decision === "dialled" ? "text-good" : ""}>{decisionLabel(a.decision)}</span>
                  </p>
                  {a.error && <p className="mt-1 break-words font-mono text-xs text-bad">{a.error}</p>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </Page>
  );
}
