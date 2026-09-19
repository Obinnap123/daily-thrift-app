import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import Link from "next/link";

export default async function AdminActivityPage({ searchParams }: { searchParams: Promise<{ outcome?: string; q?: string }> }) {
  await requireRole("SUPER_ADMIN");
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 80) ?? "";
  const outcome = params.outcome === "FAILURE" ? "FAILURE" : params.outcome === "SUCCESS" ? "SUCCESS" : undefined;
  const events = await prisma.auditLog.findMany({
    where: { actorRole: "ADMIN", ...(outcome ? { outcome } : {}), ...(q ? { OR: [{ action: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }, { actor: { name: { contains: q, mode: "insensitive" } } }] } : {}) },
    orderBy: { createdAt: "desc" }, take: 100, include: { actor: { select: { name: true, email: true } } },
  });
  return <div className="flex min-h-screen flex-col"><DashboardHeader title="Admin activity" /><DashboardNav /><main className="flex-1 space-y-5 p-4 sm:p-6">
    <div><h2 className="text-xl font-semibold text-ink">Admin activity</h2><p className="text-sm text-ink-muted">Most recent 100 recorded Admin actions, including earlier actions by an account later promoted to Super Admin.</p></div>
    <form className="flex flex-wrap gap-2"><input aria-label="Search Admin activity" name="q" defaultValue={q} placeholder="Search actions or details" className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-base text-ink sm:text-sm" /><select aria-label="Filter by outcome" name="outcome" defaultValue={outcome ?? ""} className="min-h-11 rounded-xl border border-line bg-surface px-3 text-base text-ink sm:text-sm"><option value="">All outcomes</option><option value="SUCCESS">Success</option><option value="FAILURE">Failure</option></select><button className="min-h-11 rounded-xl bg-brand-solid px-4 text-sm font-semibold text-white">Filter</button></form>
    <Card className="divide-y divide-line p-0">{events.length === 0 ? <p className="p-6 text-sm text-ink-muted">No Admin activity matches this filter.</p> : events.map((event) => <article key={event.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-ink">{event.action.replaceAll("_", " ")}</h3><span className={event.outcome === "FAILURE" ? "text-sm font-medium text-danger" : "text-sm font-medium text-brand"}>{event.outcome.toLowerCase()}</span></div><p className="mt-1 text-sm text-ink-muted">{event.summary}</p><p className="mt-2 text-xs text-ink-subtle">{event.actor?.name ?? "Former Admin"} · {format(event.createdAt, "dd MMM yyyy, h:mm a")}</p><Link href={`/super-admin/activity/${event.id}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline">View details</Link></article>)}</Card>
  </main></div>;
}
