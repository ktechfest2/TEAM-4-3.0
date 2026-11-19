import type { Metadata } from "next";
import { AddOfficialForm, PersonActions } from "@/components/forms";
import { Empty, Heading, Page, Panel, Tag, lagosTime, titleCase } from "@/components/ui";
import { eventLabel, listOfficials, listWardsAndUnits, mask } from "@/lib/server/data";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Officials" };

export default async function Officials() {
  const [officials, refs, user] = await Promise.all([listOfficials(), listWardsAndUnits(), requireUser()]);
  const units = refs.units.map((u) => ({ id: u.id, name: u.name, code: u.code }));
  return (
    <Page>
      <Heading
        title="Officials"
        lede="Presiding officers Confam trusts. When a voter reports a rumour, Confam calls the official at that polling unit and their answer settles it. Officials check in by phone with their PIN."
      />
      {user.role === "admin" && (
        <Panel title="Register a presiding officer" className="mb-6">
          <div className="px-5 py-4">
            <AddOfficialForm units={units} />
          </div>
        </Panel>
      )}
      <Panel title={`${officials.length} official${officials.length === 1 ? "" : "s"}`}>
        {officials.length === 0 ? (
          <Empty title="No officials yet">Register a presiding officer above. Without one, rumours at that unit can only be marked unverified.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {officials.map((o) => (
              <li key={o.roleId} className="grid gap-3 px-5 py-4 sm:grid-cols-[1.2fr_1fr_auto] sm:items-start">
                <div>
                  <p className="font-semibold">{o.name}</p>
                  <p className="font-mono text-sm text-muted">{mask(o.last4)}</p>
                  <p className="mt-1 text-[15px]">
                    {o.kind === "official" ? "Presiding officer" : "Ward supervisor"}, {o.pu ?? titleCase(o.ward)}
                  </p>
                </div>
                <div className="text-[15px]">
                  {o.latest ? (
                    <>
                      <Tag tone={o.latest.event === "delay" || o.latest.event === "issue" ? "warn" : "good"}>{eventLabel(o.latest.event)}</Tag>{" "}
                      at {lagosTime(o.latest.at)}
                      {o.latest.eta ? `, ETA ${o.latest.eta} min` : ""}
                    </>
                  ) : (
                    <span className="text-muted">No check-in today</span>
                  )}
                  <p className="mt-1 text-sm text-muted">{o.hasPin ? (o.locked ? "PIN locked (too many wrong tries)" : "PIN set") : "No PIN"}</p>
                </div>
                {user.role === "admin" && <PersonActions personId={o.personId} officialRoleId={o.kind === "official" ? o.roleId : undefined} />}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </Page>
  );
}
