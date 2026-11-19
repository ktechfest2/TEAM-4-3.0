import type { Metadata } from "next";
import Link from "next/link";
import { LagosClock, PauseSwitch } from "@/components/controls";
import { LiveRefresh } from "@/components/live";
import { Nav } from "@/components/nav";
import { logout } from "@/lib/server/actions";
import { getCounters, getSettings } from "@/lib/server/data";
import { requireUser } from "@/lib/server/session";

export const metadata: Metadata = {
  title: { default: "Control room", template: "%s · Confam control room" },
  robots: { index: false, follow: false },
};

export default async function ConsoleLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [settings, counters] = await Promise.all([getSettings(), getCounters()]);
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-4 px-4 py-4 lg:block lg:px-5 lg:py-6">
          <Link href="/control" className="block" aria-label="Confam control room home">
            <span className="block font-display text-[2.4rem] font-extrabold uppercase leading-[0.8] tracking-[-0.02em]">Confam</span>
            <span className="mt-1 block text-[13px] font-medium text-muted">INEC control room, Surulere LGA</span>
          </Link>
        </div>
        <div className="px-2 pb-3 lg:flex-1 lg:px-3">
          <Nav openCases={counters.open} />
        </div>
        <div className="hidden border-t border-line px-5 py-4 text-sm lg:block">
          <p className="truncate font-medium" title={user.email}>{user.email}</p>
          <p className="text-muted">{user.role === "admin" ? "Admin" : "Viewer (read only)"}</p>
          <form action={logout} className="mt-2">
            <button className="link-u text-muted" type="submit">Sign out</button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 border-b border-line bg-ground/90 backdrop-blur-[2px]">
          <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-8">
            <div className="flex items-center gap-5">
              <LagosClock />
              {settings.electionDay ? (
                <span className="rounded-[4px] bg-violet px-2 py-1 font-display text-sm font-bold uppercase tracking-wide text-surface">Election day</span>
              ) : (
                <span className="rounded-[4px] border border-line px-2 py-1 font-display text-sm font-semibold uppercase tracking-wide text-muted">Pre-election</span>
              )}
              <LiveRefresh />
            </div>
            <PauseSwitch paused={settings.outboundPaused} canEdit={user.role === "admin"} />
          </div>
          {settings.outboundPaused && (
            <p className="bg-bad px-4 py-1.5 text-center text-sm font-semibold text-surface sm:px-8">
              All outbound calls are paused. Verifier calls, callbacks and alerts are held until you resume.
            </p>
          )}
        </div>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line px-4 py-4 text-sm text-muted sm:px-8 lg:hidden">
          <form action={logout}>
            {user.email} <button className="link-u ml-2" type="submit">Sign out</button>
          </form>
        </footer>
      </div>
    </div>
  );
}
