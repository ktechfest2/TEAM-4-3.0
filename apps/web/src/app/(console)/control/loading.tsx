export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-6 sm:px-8" aria-busy="true" aria-label="Loading">
      <div className="h-16 w-72 animate-pulse rounded-[8px] bg-surface-2 [animation-duration:1.4s]" />
      <div className="mt-8 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <div className="h-80 animate-pulse rounded-[10px] bg-surface-2 [animation-duration:1.4s]" />
        <div className="h-80 animate-pulse rounded-[10px] bg-surface-2 [animation-duration:1.4s]" />
      </div>
    </div>
  );
}
