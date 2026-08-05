import Link from "next/link";
import type { ReactNode } from "react";

export function AuthLayout({ title, subtitle, children, backToChooser = false }: { title: string; subtitle: string; children: ReactNode; backToChooser?: boolean }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-canvas px-4 py-10 sm:px-6">
      <AuthBrandWash />
      <div className="relative w-full max-w-md">
        <div className="mb-7 text-center">
          <Link href="/login" className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-solid text-lg font-black text-white shadow-lg shadow-emerald-950/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">D</Link>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">Davchuks Daily Thrift</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
        </div>
        {children}
        {backToChooser && <p className="mt-6 text-center text-sm text-ink-muted">Wrong portal? <Link href="/login" className="font-semibold text-brand hover:text-brand-hover hover:underline">Choose another login</Link></p>}
      </div>
    </main>
  );
}

export function LoginFormSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-6" aria-label="Loading sign-in form" role="status">
      <div className="space-y-5 animate-pulse">
        <div><div className="mb-2 h-4 w-24 rounded bg-surface-hover" /><div className="h-11 rounded-xl bg-surface-muted" /></div>
        <div><div className="mb-2 h-4 w-20 rounded bg-surface-hover" /><div className="h-11 rounded-xl bg-surface-muted" /></div>
        <div className="h-11 rounded-xl bg-brand-soft" />
      </div>
      <span className="sr-only">Loading sign-in form</span>
    </div>
  );
}

export function AppLoadingScreen({ label = "Preparing your workspace…" }: { label?: string }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-canvas px-6 text-center">
      <AuthBrandWash />
      <div className="relative" role="status" aria-live="polite">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-solid text-xl font-black text-white shadow-lg">D</span>
        <div className="mx-auto mt-6 h-1.5 w-40 overflow-hidden rounded-full bg-surface-hover"><span className="block h-full w-2/3 animate-pulse rounded-full bg-brand" /></div>
        <p className="mt-4 text-sm font-medium text-ink-muted">{label}</p>
      </div>
    </main>
  );
}

export function AuthBrandWash() {
  return <div className="auth-brand-wash pointer-events-none absolute inset-0" aria-hidden="true" />;
}
