"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Subscribes to /api/stream (Postgres LISTEN/NOTIFY relayed as SSE) and refreshes the
 * server-rendered page when something changes. Debounced so a burst of events = one refresh.
 */
export function LiveRefresh() {
  const router = useRouter();
  const [state, setState] = useState<"connecting" | "live" | "offline">("connecting");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    const connect = () => {
      es = new EventSource("/api/stream");
      es.addEventListener("ready", () => setState("live"));
      es.addEventListener("change", () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), 350);
      });
      es.onerror = () => {
        setState("offline");
        es?.close();
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      es?.close();
      if (retry) clearTimeout(retry);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  const label = { connecting: "Connecting", live: "Live", offline: "Reconnecting" }[state];
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status" aria-live="polite">
      <span className="relative flex size-2.5">
        {state === "live" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-40 [animation-duration:2.4s]" />}
        <span className={`relative inline-flex size-2.5 rounded-full ${state === "live" ? "bg-good" : state === "offline" ? "bg-warn" : "bg-line"}`} />
      </span>
      {label}
    </span>
  );
}
