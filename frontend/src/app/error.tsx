'use client';

// Sits in the root segment because an error.tsx does not catch a throw from
// the layout of its own segment, and the throw comes from the (app) layout.
// The error is deliberately never rendered: it may carry backend detail.
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-space-md px-margin-mobile text-center">
      <h1 className="font-headline-lg text-headline-lg text-fg">Could not load this page</h1>
      <p className="text-fg-muted">Something went wrong on our side. Try again in a few minutes.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-border px-space-md py-space-sm text-fg hover:bg-surface-container-high"
      >
        Try again
      </button>
    </main>
  );
}
