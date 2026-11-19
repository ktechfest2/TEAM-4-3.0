"use client";

export default function ConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="font-display text-5xl font-bold uppercase">This view couldn&apos;t load</h1>
      <p className="mt-3 text-lg text-muted">
        {error.message.includes("admins") ? error.message : "The control room couldn't reach its database. Calls keep running; try again in a moment."}
      </p>
      {error.digest && <p className="mt-2 font-mono text-sm text-muted">Reference {error.digest}</p>}
      <button type="button" onClick={reset} className="btn btn-primary mt-6">Try again</button>
    </div>
  );
}
