"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

interface Turn {
  role?: string;
  speaker?: string;
  text?: string;
  content?: string;
  message?: string;
}

function turns(transcript: unknown, text: string | null): { who: string; said: string }[] {
  if (Array.isArray(transcript)) {
    return (transcript as Turn[])
      .map((t) => ({ who: String(t.role ?? t.speaker ?? "?"), said: String(t.text ?? t.content ?? t.message ?? "") }))
      .filter((t) => t.said.trim());
  }
  if (text) return text.split("\n").filter(Boolean).map((l) => ({ who: "", said: l }));
  return [];
}

export function Transcript({ transcript, text }: { transcript: unknown; text: string | null }) {
  const [open, setOpen] = useState(false);
  const list = turns(transcript, text);
  if (list.length === 0) return <span className="text-sm text-muted">No transcript yet</span>;
  return (
    <div>
      <button type="button" className="link-u text-sm font-semibold" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Hide transcript" : `Transcript (${list.length} turns)`}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0, transition: { duration: 0.15 } }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="mt-2 max-w-2xl space-y-1.5 overflow-hidden text-[15px]"
          >
            {list.map((t, i) => {
              const agent = /agent|assistant|bot/i.test(t.who);
              return (
                <li key={i} className={agent ? "text-ink" : "text-violet"}>
                  <span className="mr-2 font-display text-sm font-semibold uppercase">{agent ? "Confam" : t.who ? "Caller" : ""}</span>
                  {t.said}
                </li>
              );
            })}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  );
}
