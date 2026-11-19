import Link from "next/link";
import type { Metadata } from "next";
import { Empty, Heading, Page, Panel, Tag, CATEGORY_LABEL, timeAgo, titleCase } from "@/components/ui";
import { VerdictStamp } from "@/components/verdict-stamp";
import { listCases } from "@/lib/server/data";

export const metadata: Metadata = { title: "Rumours" };

export default async function Rumours({ searchParams }: PageProps<"/control/rumours">) {
  const sp = await searchParams;
  const filter = sp.status === "verifying" || sp.status === "published" ? sp.status : undefined;
  const cases = await listCases(filter);
  const tabs = [
    { key: undefined, label: "All" },
    { key: "verifying", label: "Being checked" },
    { key: "published", label: "Verdicts" },
  ] as const;
  return (
    <Page>
      <Heading title="Rumours" lede="Every rumour voters reported by phone, grouped when several people report the same thing, with the verdict Confam reached from verifiers on the ground." />
      <div className="mb-4 flex gap-1" role="tablist" aria-label="Filter rumours">
        {tabs.map((t) => {
          const on = filter === t.key;
          return (
            <Link
              key={t.label}
              role="tab"
              aria-selected={on}
              href={t.key ? `/control/rumours?status=${t.key}` : "/control/rumours"}
              className={`btn ${on ? "btn-primary" : "btn-quiet"} py-1.5 text-sm`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <Panel>
        {cases.length === 0 ? (
          <Empty title="No rumours yet">Call the Confam line and report one to see the pipeline work end to end.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">Rumour</th>
                  <th className="px-3 py-3 font-medium">Where</th>
                  <th className="px-3 py-3 font-medium">Reports</th>
                  <th className="px-3 py-3 font-medium">Verifiers</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {cases.map((c) => (
                  <tr key={c.id} className="transition-colors duration-200 hover:bg-surface-2">
                    <td className="px-5 py-4">
                      <Link href={`/control/rumours/${c.id}`} className="link-u font-semibold">{c.claim}</Link>
                      <div className="mt-1 flex items-center gap-2 text-sm text-muted">
                        <Tag tone={c.category === "violence" ? "bad" : "neutral"}>{CATEGORY_LABEL[c.category]}</Tag>
                        {timeAgo(c.createdAt)}
                      </div>
                    </td>
                    <td className="px-3 py-4 text-[15px]">{c.pu ?? titleCase(c.ward ?? "Unknown")}</td>
                    <td className="px-3 py-4 font-mono">{c.reports}</td>
                    <td className="px-3 py-4 font-mono">{c.answered}/{c.asked}</td>
                    <td className="px-5 py-4">
                      {c.status === "published" && c.verdict ? (
                        <VerdictStamp verdict={c.verdict} size="sm" animate={false} />
                      ) : (
                        <Tag tone="warn">Checking</Tag>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </Page>
  );
}
