import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-start justify-center px-6 sm:px-16">
      <p className="font-mono text-muted">404</p>
      <h1 className="mt-2 font-display text-[clamp(3rem,10vw,7rem)] font-extrabold uppercase leading-[0.85]">Not on the register</h1>
      <p className="mt-4 max-w-md text-lg text-muted">This page doesn&apos;t exist, or the record was removed.</p>
      <Link href="/" className="btn btn-primary mt-8">Back to the control room</Link>
    </main>
  );
}
