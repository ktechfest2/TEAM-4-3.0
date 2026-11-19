import type { Metadata } from "next";
import { SettingsForm } from "@/components/forms";
import { Heading, Page, Panel } from "@/components/ui";
import { getSettings } from "@/lib/server/data";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Settings" };

export default async function Settings() {
  const [s, user] = await Promise.all([getSettings(), requireUser()]);
  return (
    <Page>
      <Heading title="Settings" lede="How Confam decides and when it calls. Changes apply to the next call or verdict immediately." />
      <Panel className="max-w-4xl">
        {user.role === "admin" ? (
          <SettingsForm s={s} />
        ) : (
          <p className="px-5 py-6 text-muted">Only admins can change settings.</p>
        )}
      </Panel>
      <Panel title="Line" className="mt-6 max-w-4xl">
        <dl className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted">Confam number</dt>
            <dd className="font-mono text-lg">{process.env.CONFAM_LINE_NUMBER ?? "Not configured"}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted">Mode</dt>
            <dd className="text-lg">{process.env.DEMO_MODE === "true" ? "Demo: real calls go only to numbers registered here (voters, officials) and people who called in" : "Production"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-sm text-muted">Languages</dt>
            <dd className="text-[17px]">Callers can speak English, Pidgin, Yoruba, Hausa or Igbo. Confam answers in Pidgin or English until native voices are enabled.</dd>
          </div>
        </dl>
      </Panel>
    </Page>
  );
}
