"use client";

import { AnimatePresence, motion } from "motion/react";
import { useActionState, useMemo, useState, useTransition } from "react";
import { addOfficial, addVoter, createRelocation, moveVoter, removePerson, resetPin, undoRelocation, updateSettings, type ActionState } from "@/lib/server/actions";

function Result({ state }: { state: ActionState }) {
  return (
    <AnimatePresence mode="wait">
      {state && (
        <motion.div
          key={state.message}
          role="status"
          initial={{ opacity: 0, y: 4 }}
          animate={state.ok ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, x: [0, -6, 6, -3, 3, 0] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={`mt-3 rounded-[6px] px-3 py-2 text-sm font-medium ${state.ok ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}
        >
          {state.message}
          {state.secret && (
            <p className="mt-2 font-mono text-2xl tracking-[0.3em] text-ink" aria-label={`PIN ${state.secret.split("").join(" ")}`}>
              {state.secret}
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Submit({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return (
    <button type="submit" className="btn btn-primary" disabled={pending}>
      {pending ? busy : idle}
    </button>
  );
}

export interface PuOption {
  id: string;
  name: string;
  code: string;
  status: string;
  subscribers: number;
  realSubscribers: number;
}

export function RelocationForm({ units }: { units: PuOption[] }) {
  const [state, action, pending] = useActionState(createRelocation, null);
  const [from, setFrom] = useState("");
  const selected = useMemo(() => units.find((u) => u.id === from), [from, units]);
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Polling unit that moved</span>
        <select name="puId" className="field" required value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">Choose a polling unit</option>
          {units.filter((u) => u.status === "active").map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">New location</span>
        <select name="newPuId" className="field" required defaultValue="">
          <option value="">Choose where voters should go</option>
          {units.filter((u) => u.id !== from).map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
          ))}
        </select>
      </label>
      <AnimatePresence>
        {selected && (
          <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden text-[15px] text-muted">
            Confam will call <strong className="text-ink">{selected.subscribers}</strong> registered voter{selected.subscribers === 1 ? "" : "s"} at this unit right away.
          </motion.p>
        )}
      </AnimatePresence>
      <Submit pending={pending} idle="Issue notice and call voters" busy="Issuing notice…" />
      <Result state={state} />
    </form>
  );
}

export function UndoRelocation({ puId }: { puId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="link-u text-sm text-muted" disabled={pending} onClick={() => start(async () => void (await undoRelocation(puId)))}>
      {pending ? "Restoring…" : "Mark active again"}
    </button>
  );
}

const NEED_OPTIONS = [
  ["elderly", "Elderly"],
  ["mobility", "Mobility"],
  ["low_vision", "Low vision"],
  ["blind", "Blind"],
  ["hearing", "Hearing"],
] as const;

type Unit = { id: string; name: string; code: string };

export function AddVoterForm({ units }: { units: Unit[] }) {
  const [state, action, pending] = useActionState(addVoter, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Name</span>
        <input name="displayName" className="field" required autoComplete="off" placeholder="e.g. Amara Okafor" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Phone</span>
        <input name="phone" className="field" required inputMode="tel" autoComplete="off" placeholder="0803 123 4567" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Registered at</span>
        <select name="puId" className="field" required defaultValue="">
          <option value="">Choose a polling unit</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
          ))}
        </select>
      </label>
      <fieldset className="sm:col-span-3">
        <legend className="mb-1 text-sm font-semibold">Needs help on election day (optional)</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {NEED_OPTIONS.map(([v, label]) => (
            <label key={v} className="inline-flex items-center gap-2 text-[15px]">
              <input type="checkbox" name="needs" value={v} className="size-4 accent-[var(--violet)]" /> {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-3">
        <Submit pending={pending} idle="Add to voter list" busy="Adding…" />
        <Result state={state} />
      </div>
    </form>
  );
}

export function MoveVoter({ personId, currentPuId, units }: { personId: string; currentPuId: string; units: Unit[] }) {
  const [target, setTarget] = useState("");
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  return (
    <div className="min-w-[15rem]">
      <div className="flex gap-2">
        <select aria-label="Move to polling unit" className="field py-1.5 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="">Move to…</option>
          {units.filter((u) => u.id !== currentPuId).map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-violet shrink-0 py-1.5 text-sm"
          disabled={!target || pending}
          onClick={() =>
            start(async () => {
              const r = await moveVoter(personId, target);
              setState(r);
              if (r?.ok) setTarget("");
            })
          }
        >
          {pending ? "Moving…" : "Move and call"}
        </button>
      </div>
      <Result state={state} />
    </div>
  );
}

export function AddOfficialForm({ units }: { units: Unit[] }) {
  const [state, action, pending] = useActionState(addOfficial, null);
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-3">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Name</span>
        <input name="displayName" className="field" required autoComplete="off" placeholder="e.g. Mr Tunde Bello" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Phone</span>
        <input name="phone" className="field" required inputMode="tel" autoComplete="off" placeholder="0803 123 4567" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold">Presiding officer at</span>
        <select name="puId" className="field" required defaultValue="">
          <option value="">Choose a polling unit</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.name} ({u.code})</option>
          ))}
        </select>
      </label>
      <div className="sm:col-span-3">
        <Submit pending={pending} idle="Register official" busy="Registering…" />
        <Result state={state} />
      </div>
    </form>
  );
}

export function PersonActions({ personId, officialRoleId }: { personId: string; officialRoleId?: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="text-sm">
      <div className="flex flex-wrap justify-end gap-3">
        {officialRoleId && (
          <button type="button" className="link-u font-semibold" disabled={pending} onClick={() => start(async () => setState(await resetPin(officialRoleId)))}>
            New PIN
          </button>
        )}
        {confirm ? (
          <button type="button" className="link-u font-semibold text-bad" disabled={pending} onClick={() => start(async () => setState(await removePerson(personId)))}>
            Confirm remove
          </button>
        ) : (
          <button type="button" className="link-u text-muted" onClick={() => setConfirm(true)}>
            Remove
          </button>
        )}
      </div>
      <Result state={state} />
    </div>
  );
}

export function SettingsForm({ s }: { s: { electionDay: boolean; openingDeadline: string; verdictMinAnswers: number; verdictThreshold: number; caseDeadlineMinutes: number; factValidHours: number; quietStart: string; quietEnd: string } }) {
  const [state, action, pending] = useActionState(updateSettings, null);
  const row = "grid gap-1 sm:grid-cols-[1fr_12rem] sm:items-center sm:gap-6";
  return (
    <form action={action} className="divide-y divide-line">
      <label className={`${row} px-5 py-4`}>
        <span>
          <span className="block font-semibold">Election day</span>
          <span className="text-sm text-muted">Turns on the lateness sweep and lifts quiet hours for alerts.</span>
        </span>
        <input type="checkbox" name="electionDay" defaultChecked={s.electionDay} className="size-5 accent-[var(--violet)]" />
      </label>
      <label className={`${row} px-5 py-4`}>
        <span>
          <span className="block font-semibold">Officials must check in by</span>
          <span className="text-sm text-muted">After this time (Lagos), Confam calls presiding officers who haven&apos;t, then their supervisor 15 minutes later.</span>
        </span>
        <input name="openingDeadline" type="time" className="field" defaultValue={s.openingDeadline} required />
      </label>
      <label className={`${row} px-5 py-4`}>
        <span>
          <span className="block font-semibold">Answers needed</span>
          <span className="text-sm text-muted">Independent answers required before a verdict is published automatically.</span>
        </span>
        <input name="verdictMinAnswers" type="number" min={1} max={5} className="field" defaultValue={s.verdictMinAnswers} required />
      </label>
      <label className={`${row} px-5 py-4`}>
        <span>
          <span className="block font-semibold">Agreement threshold</span>
          <span className="text-sm text-muted">Share of reputation-weighted answers on one side (0.5 to 1).</span>
        </span>
        <input name="verdictThreshold" type="number" step="0.05" min={0.5} max={1} className="field" defaultValue={s.verdictThreshold} required />
      </label>
      <label className={`${row} px-5 py-4`}>
        <span>
          <span className="block font-semibold">Verification deadline (minutes)</span>
          <span className="text-sm text-muted">If no clear answer arrives by then, the rumour is published as unverified.</span>
        </span>
        <input name="caseDeadlineMinutes" type="number" min={2} max={120} className="field" defaultValue={s.caseDeadlineMinutes} required />
      </label>
      <label className={`${row} px-5 py-4`}>
        <span>
          <span className="block font-semibold">Verdict stays valid (hours)</span>
          <span className="text-sm text-muted">After this, a repeat of the same rumour is checked again.</span>
        </span>
        <input name="factValidHours" type="number" min={1} max={48} className="field" defaultValue={s.factValidHours} required />
      </label>
      <div className={`${row} px-5 py-4`}>
        <span>
          <span className="block font-semibold">Quiet hours for alerts</span>
          <span className="text-sm text-muted">Go-now calls wait until morning (not on election day). INEC notices always go out immediately.</span>
        </span>
        <span className="flex items-center gap-2">
          <input aria-label="Quiet hours start" name="quietStart" type="time" className="field" defaultValue={s.quietStart} required />
          <input aria-label="Quiet hours end" name="quietEnd" type="time" className="field" defaultValue={s.quietEnd} required />
        </span>
      </div>
      <div className="px-5 py-4">
        <Submit pending={pending} idle="Save settings" busy="Saving…" />
        <Result state={state} />
      </div>
    </form>
  );
}
