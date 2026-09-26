"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard render failed", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-page p-4">
      <section className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-danger">Temporary problem</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">This page could not load</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          Your records have not been changed. Check your connection and try loading the page again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 min-h-11 rounded-xl bg-brand-solid px-5 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          Try again
        </button>
        {error.digest && <p className="mt-4 text-xs text-ink-subtle">Reference: {error.digest}</p>}
      </section>
    </main>
  );
}
