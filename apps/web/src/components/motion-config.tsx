"use client";

import { MotionConfig } from "motion/react";
import { useEffect } from "react";

/**
 * Browsers cancel a running View Transition when the viewport changes mid-navigation (mobile URL bar, rotation)
 * and report the cancellation as an unhandled promise rejection. The navigation itself completes normally, so we
 * swallow only that specific, harmless rejection and let every other error surface.
 */
function useSilenceAbortedViewTransitions() {
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { name?: string; message?: string } | undefined;
      if (r && (r.name === "InvalidStateError" || r.name === "AbortError") && /transition was (aborted|skipped)/i.test(r.message ?? "")) {
        e.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);
}

export function MotionConfigProvider({ children }: { children: React.ReactNode }) {
  useSilenceAbortedViewTransitions();
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
