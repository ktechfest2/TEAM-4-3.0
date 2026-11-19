import type { Metadata } from "next";
import { RelocationForm, UndoRelocation } from "@/components/forms";
import { PuMap, type MapUnit } from "@/components/pu-map";
import { Heading, Page, Panel, Tag, lagosTime, titleCase } from "@/components/ui";
import { eventLabel, getSettings, listNotices, listUnits } from "@/lib/server/data";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Polling units" };

function lagosMinutes(d: Date) {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Lagos" }).format(d).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export default async function Units() {
  const [units, settings, notices, user] = await Promise.all([listUnits(), getSettings(), listNotices(), requireUser()]);
  const [dh, dm] = settings.openingDeadline.split(":").map(Number);
  const pastDeadline = settings.electionDay && lagosMinutes(new Date()) >= (dh ?? 0) * 60 + (dm ?? 0);
  const byId = new Map(units.map((u) => [u.id, u]));

  const state = (u: (typeof units)[number]): MapUnit["state"] => {
    if (u.status === "relocated") return "relocated";
    if (u.latest && (u.latest.event === "arrived" || u.latest.event === "voting_started" || u.latest.event === "materials_received")) return "arrived";
    if (u.latest && (u.latest.event === "delay" || u.latest.event === "issue")) return "delay";
    if (pastDeadline && u.officials > 0) return "late";
    return "idle";
  };

  return (
    <Page>
      <Heading
        title="Polling units"
        lede="Demo polling units across the 12 real Surulere wards. Officials check in by phone; when a unit moves, issue a notice and Confam calls every subscribed voter."
      />
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <PuMap units={units.map((u) => ({ id: u.id, code: u.code, name: u.name, lat: u.lat, lng: u.lng, state: state(u) }))} />
        <Panel title="Relocation notice">
          <div className="px-5 py-4">
            {user.role === "admin" ? (
              <RelocationForm units={units.map((u) => ({ id: u.id, name: u.name, code: u.code, status: u.status, subscribers: u.subscribers, realSubscribers: u.realSubscribers }))} />
            ) : (
              <p className="text-muted">Only admins can issue notices.</p>
            )}
            {notices.length > 0 && (
              <div className="mt-6 border-t border-line pt-4">
                <p className="mb-2 text-sm font-semibold text-muted">Recent notices</p>
                <ul className="space-y-2 text-[15px]">
                  {notices.slice(0, 5).map((n) => (
                    <li key={n.id}>
                      <span className="font-mono text-sm text-muted">{lagosTime(n.createdAt)}</span> {n.body}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <Panel className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="border-b border-line text-sm text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Polling unit</th>
                <th className="px-3 py-3 font-medium">Ward</th>
                <th className="px-3 py-3 font-medium">Latest from officials</th>
                <th className="px-3 py-3 font-medium">Voters</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {units.map((u) => {
                const s = state(u);
                return (
                  <tr key={u.id}>
                    <td className="px-5 py-4">
                      <p className="font-semibold">{u.name}</p>
                      <p className="text-sm text-muted"><span className="font-mono">{u.code}</span>, {u.address}{u.landmark ? `, ${u.landmark}` : ""}</p>
                      {u.status === "relocated" && u.relocatedToId && (
                        <p className="mt-1 text-sm text-violet">Moved to {byId.get(u.relocatedToId)?.name ?? "another unit"}</p>
                      )}
                    </td>
                    <td className="px-3 py-4 text-[15px]">{titleCase(u.ward)}</td>
                    <td className="px-3 py-4 text-[15px]">
                      {u.latest ? (
                        <>
                          {eventLabel(u.latest.event)} at {lagosTime(u.latest.at)}
                          {u.latest.eta ? `, ETA ${u.latest.eta} min` : ""}
                          {u.latest.note ? <span className="block text-sm text-muted">{u.latest.note}</span> : null}
                        </>
                      ) : (
                        <span className="text-muted">{u.officials > 0 ? "No check-in yet" : "No official assigned"}</span>
                      )}
                    </td>
                    <td className="px-3 py-4 text-[15px]">
                      {u.subscribers}
                      {u.needs > 0 && <span className="block text-sm text-violet">{u.needs} need assistance</span>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col items-start gap-1">
                        <Tag tone={s === "arrived" ? "good" : s === "late" ? "bad" : s === "delay" ? "warn" : s === "relocated" ? "ink" : "neutral"}>
                          {{ arrived: "Officials in", late: "Late", delay: "Delayed", relocated: "Relocated", idle: "Waiting" }[s]}
                        </Tag>
                        {u.status === "relocated" && user.role === "admin" && <UndoRelocation puId={u.id} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </Page>
  );
}
