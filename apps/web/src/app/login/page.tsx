import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "./form";
import { getSessionUser } from "@/lib/server/session";

export const metadata: Metadata = { title: "Control room sign in", robots: { index: false, follow: false } };

export default async function Login() {
  if (await getSessionUser()) redirect("/control");
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.3fr_1fr]">
      <section className="relative flex flex-col justify-between overflow-hidden bg-ink px-6 py-8 text-ground sm:px-12 sm:py-12">
        <p className="font-medium opacity-70">Surulere LGA, Lagos</p>
        <div className="my-16">
          <h1 className="font-display text-[clamp(4.5rem,15vw,12rem)] font-extrabold uppercase leading-[0.78] tracking-[-0.03em]">
            <span className="block overflow-hidden"><span className="block animate-[rise_900ms_cubic-bezier(0.16,1,0.3,1)_both]">Con</span></span>
            <span className="block overflow-hidden"><span className="block animate-[rise_900ms_120ms_cubic-bezier(0.16,1,0.3,1)_both]">fam</span></span>
          </h1>
          <p className="mt-6 max-w-md text-xl leading-snug opacity-80">
            The election line anyone can call. It checks rumours with people on the ground and calls voters back, in their language.
          </p>
        </div>
        <p className="max-w-md text-sm opacity-60">INEC control room. Authorised staff only. Every action is logged.</p>
        <span
          aria-hidden
          className="pointer-events-none absolute -right-10 bottom-20 rotate-[-8deg] rounded-[6px] border-4 px-6 py-2 font-display text-5xl font-bold tracking-[0.08em] opacity-25 animate-[stamp_500ms_700ms_cubic-bezier(0.16,1,0.3,1)_both] sm:text-7xl"
          style={{ color: "#3fb36f", borderColor: "#3fb36f" }}
        >
          CONFIRMED
        </span>
      </section>
      <section className="flex items-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm">
          <h2 className="animate-[enter_600ms_350ms_cubic-bezier(0.23,1,0.32,1)_both] font-display text-4xl font-bold uppercase">Control room sign in</h2>
          <p className="mt-2 animate-[enter_600ms_430ms_cubic-bezier(0.23,1,0.32,1)_both] text-muted">
            {process.env.JUDGE_EMAIL ? "Judges: the demo login is already filled in. Just press Sign in." : "Use the account your coordinator created for you."}
          </p>
          <div className="animate-[enter_600ms_510ms_cubic-bezier(0.23,1,0.32,1)_both]">
            <LoginForm judgeEmail={process.env.JUDGE_EMAIL} judgePassword={process.env.JUDGE_PASSWORD} />
          </div>
        </div>
      </section>
    </main>
  );
}
