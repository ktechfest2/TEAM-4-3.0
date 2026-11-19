import type { Metadata } from "next";
import { AddVoterForm, MoveVoter, PersonActions } from "@/components/forms";
import { Empty, Heading, Page, Panel, Tag, lagosTime } from "@/components/ui";
import { listAssistanceRequests, listVoters, listWardsAndUnits, mask } from "@/lib/server/data";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Voter list" };

const ALERT_LABEL: Record<string, string> = { pending: "queued", calling: "calling", delivered: "delivered", heard: "heard", no_answer: "no answer", skipped: "held", failed: "failed" };
const KIND_LABEL: Record<string, string> = { transfer: "Location change", notice: "Unit relocated", case: "Rumour verdict", go_now: "Go-now" };

export default async function Voters() {
  const [voters, assistance, refs, user] = await Promise.all([listVoters(), listAssistanceRequests(), listWardsAndUnits(), requireUser()]);
  const units = refs.units.map((u) => ({ id: u.id, name: u.name, code: u.code }));
  return (
    <Page>
      <Heading
        title="Voter list"
        lede="Registered voters and their polling unit, standing in for INEC's register. Only these numbers can ask Confam about their own polling unit. Move a voter and Confam calls them within seconds."
      />
      {user.role === "admin" && (
        <Panel title="Register a voter" className="mb-6">
          <div className="px-5 py-4">
            <AddVoterForm units={units} />
          </div>
        </Panel>
      )}
      <Panel title={`${voters.length} registered voter${voters.length === 1 ? "" : "s"}`}>
        {voters.length === 0 ? (
          <Empty title="No voters yet">Register a voter above with a real phone number to try the location-change call.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Voter</th>
                  <th className="px-3 py-3 font-medium">Polling unit</th>
                  <th className="px-3 py-3 font-medium">Last call from Confam</th>
                  <th className="px-5 py-3 font-medium">Change location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {voters.map((v) => (
                  <tr key={v.personId}>
                    <td className="px-5 py-4 align-top">
                      <p className="font-semibold">{v.name}</p>
                      <p className="font-mono text-sm text-muted">{mask(v.last4)}</p>
                      {v.needs.length > 0 && <p className="mt-1 text-sm text-violet">Needs: {v.needs.map((n) => n.replace("_", " ")).join(", ")}</p>}
                    </td>
                    <td className="px-3 py-4 align-top text-[15px]">
                      {v.pu} <span className="block font-mono text-sm text-muted">{v.puCode}</span>
                      {v.puStatus === "relocated" && <Tag tone="ink">Unit relocated</Tag>}
                    </td>
                    <td className="px-3 py-4 align-top text-[15px]">
                      {v.lastAlert ? (
                        <>
                          {KIND_LABEL[v.lastAlert.kind] ?? v.lastAlert.kind}{" "}
                          <Tag tone={v.lastAlert.status === "heard" || v.lastAlert.status === "delivered" ? "good" : v.lastAlert.status === "failed" ? "bad" : "neutral"}>
                            {ALERT_LABEL[v.lastAlert.status] ?? v.lastAlert.status}
                          </Tag>
                          <span className="block text-sm text-muted">{lagosTime(v.lastAlert.at)}</span>
                        </>
                      ) : (
                        <span className="text-muted">None yet</span>
                      )}
                    </td>
                    <td className="px-5 py-4 align-top">
                      {user.role === "admin" ? (
                        <div className="space-y-2">
                          <MoveVoter personId={v.personId} currentPuId={v.puId} units={units} />
                          <PersonActions personId={v.personId} />
                        </div>
                      ) : (
                        <span className="text-sm text-muted">Admins only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Elderly and disability requests" className="mt-6">
        {assistance.length === 0 ? (
          <p className="px-5 py-6 text-muted">Anyone can call Confam and ask for help on election day. Requests appear here; the presiding officer is told when they check in, and the caller gets a &ldquo;go now&rdquo; call once officials arrive.</p>
        ) : (
          <ul className="divide-y divide-line">
            {assistance.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span>
                  <span className="font-semibold">{a.name}</span> <span className="font-mono text-sm text-muted">{mask(a.last4)}</span>
                  <span className="block text-sm text-muted">{a.pu}, needs {a.needs.map((n) => n.replace("_", " ")).join(", ")}</span>
                </span>
                <Tag tone={a.goNowSentAt ? "good" : "neutral"}>{a.goNowSentAt ? `Go-now call ${lagosTime(a.goNowSentAt)}` : "Waiting for officials"}</Tag>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Page>
  );
}
