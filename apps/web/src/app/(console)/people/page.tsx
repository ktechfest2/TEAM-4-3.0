import type { Metadata } from "next";
import { AddPersonForm, PersonActions } from "@/components/forms";
import { Heading, Page, Panel, Tag, titleCase } from "@/components/ui";
import { listPeople, listWardsAndUnits, mask } from "@/lib/server/data";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "People" };

const ROLE_LABEL = { verifier: "Verifier", official: "Presiding officer", supervisor: "Supervisor" } as const;

export default async function People() {
  const [people, refs, user] = await Promise.all([listPeople(), listWardsAndUnits(), requireUser()]);
  const team = people.filter((p) => p.isTeam).length;
  const demo = people.filter((p) => p.isDemo).length;
  return (
    <Page>
      <Heading
        title="People"
        lede={`Verifiers, polling officials and subscribed voters. ${team} team phone${team === 1 ? "" : "s"} receive real calls; ${demo} demo contacts are simulated and never dialled. Numbers are stored encrypted and shown masked.`}
      />
      {user.role === "admin" && (
        <Panel title="Add someone" className="mb-6">
          <div className="px-5 py-4">
            <AddPersonForm wards={refs.wards} units={refs.units} />
          </div>
        </Panel>
      )}
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="border-b border-line text-sm text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Person</th>
                <th className="px-3 py-3 font-medium">Roles</th>
                <th className="px-3 py-3 font-medium">Alerts</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {people.map((p) => {
                const official = p.roles.find((r) => r.kind === "official");
                return (
                  <tr key={p.id}>
                    <td className="px-5 py-4 align-top">
                      <p className="font-semibold">{p.name}</p>
                      <p className="flex items-center gap-2 text-sm text-muted">
                        <span className="font-mono">{mask(p.last4)}</span>
                        {p.isTeam && <Tag tone="ink">Team phone</Tag>}
                        {p.isDemo && <Tag>Demo contact</Tag>}
                      </p>
                    </td>
                    <td className="px-3 py-4 align-top text-[15px]">
                      {p.roles.length === 0 ? (
                        <span className="text-muted">Voter</span>
                      ) : (
                        <ul className="space-y-1">
                          {p.roles.map((r) => (
                            <li key={r.id}>
                              <span className="font-medium">{ROLE_LABEL[r.kind]}</span>{" "}
                              <span className="text-muted">
                                {r.pu ?? titleCase(r.ward)}
                                {r.kind === "verifier" ? `, ${r.affiliation ? titleCase(r.affiliation.replace("_", " ")) : "unaffiliated"}, rep ${r.reputation.toFixed(1)}` : ""}
                                {r.kind === "official" ? (r.hasPin ? ", PIN set" : ", no PIN") : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-4 align-top text-[15px]">
                      {p.subscriptions.length === 0 ? (
                        <span className="text-muted">None</span>
                      ) : (
                        p.subscriptions.map((s) => (
                          <p key={s.pu}>
                            {s.pu}
                            {s.needs.length > 0 && <span className="block text-sm text-violet">Needs: {s.needs.map((n) => n.replace("_", " ")).join(", ")}</span>}
                          </p>
                        ))
                      )}
                    </td>
                    <td className="px-5 py-4 align-top">{user.role === "admin" && <PersonActions personId={p.id} officialRoleId={official?.id} />}</td>
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
