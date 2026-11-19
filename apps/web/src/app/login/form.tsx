"use client";

import { motion } from "motion/react";
import { useActionState } from "react";
import { login } from "@/lib/server/actions";

export function LoginForm({ judgeEmail, judgePassword }: { judgeEmail?: string; judgePassword?: string }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="mt-8 space-y-4" noValidate={false}>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Email</span>
        <input name="email" type="email" autoComplete="username" required className="field" defaultValue={judgeEmail} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className="field" defaultValue={judgePassword} />
      </label>
      {state && !state.ok && (
        <motion.p key={state.message} role="alert" initial={{ x: 0 }} animate={{ x: [0, -6, 6, -3, 3, 0] }} transition={{ duration: 0.3 }} className="text-sm font-medium text-bad">
          {state.message}
        </motion.p>
      )}
      <button type="submit" className="btn btn-primary w-full justify-center py-3 text-base" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
