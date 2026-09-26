import Link from "next/link";
import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getFinancialOverview } from "@/server/repositories/financial.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";

const money = (value: number) => `₦${value.toLocaleString()}`;

export default async function SuperAdminOverview() {
  await requireRole("SUPER_ADMIN");
  const [financial, admin, recent, customerCount, agentCount] = await Promise.all([
    getFinancialOverview(),
    prisma.user.findFirst({ where: { role: "ADMIN", isActive: true, archivedAt: null }, select: { name: true, email: true, lastLoginAt: true, emailVerifiedAt: true } }),
    prisma.auditLog.findMany({ where: { actorRole: "ADMIN" }, orderBy: { createdAt: "desc" }, take: 6, include: { actor: { select: { name: true } } } }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.user.count({ where: { role: "AGENT", isActive: true } }),
  ]);

  return <div className="flex min-h-screen flex-col">
    <DashboardHeader title="Super Admin" />
    <DashboardNav />
    <main className="flex-1 space-y-6 p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold text-ink">Business overview</h2>
        <p className="mt-1 text-sm text-ink-muted">Company-wide figures and the Admin work that needs your attention.</p>
      </div>
      <div className="grid gap-3 min-[380px]:grid-cols-2 lg:grid-cols-4">
        <Metric label="Customer savings still held" value={money(financial.availableBalance)} hint="Collected savings not yet settled by payout" />
        <Metric label="Paid out today" value={money(financial.paidOutToday)} />
        <Metric label="Lifetime collections" value={money(financial.lifetimeCollections)} />
        <Metric label="Commission earned" value={money(financial.commissionEarned)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Card className="space-y-3">
          <div className="flex items-start justify-between gap-3"><h3 className="font-semibold text-ink">Admin account</h3><Link href="/super-admin/admin" className="text-sm font-medium text-brand hover:underline">Manage</Link></div>
          {admin ? <><p className="font-medium text-ink">{admin.name}</p><p className="break-all text-sm text-ink-muted">{admin.email}</p><p className="text-sm text-ink-muted">{admin.emailVerifiedAt ? "Email verified" : "Invitation pending"} · {admin.lastLoginAt ? `Last sign-in ${format(admin.lastLoginAt, "dd MMM yyyy, h:mm a")}` : "No sign-in yet"}</p></> : <p className="text-sm text-ink-muted">No active Admin. Invite one to operate the business.</p>}
          <p className="border-t border-line pt-3 text-sm text-ink-muted">{customerCount} customers · {agentCount} active agents</p>
        </Card>
        <Card className="space-y-3">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-ink">Recent Admin activity</h3><p className="text-sm text-ink-muted">Actions are attributed to the person who performed them.</p></div><Link href="/super-admin/activity" className="shrink-0 text-sm font-medium text-brand hover:underline">View all</Link></div>
          {recent.length === 0 ? <p className="py-5 text-sm text-ink-muted">No Admin activity recorded yet.</p> : <ul className="divide-y divide-line">{recent.map((event) => <li key={event.id} className="py-3"><div className="flex flex-wrap items-center justify-between gap-1"><Link href={`/super-admin/activity/${event.id}`} className="text-sm font-medium text-ink hover:text-brand hover:underline">{event.action.replaceAll("_", " ")}</Link><span className="text-xs text-ink-muted">{format(event.createdAt, "dd MMM, h:mm a")}</span></div><p className="mt-1 text-sm text-ink-muted">{event.summary}</p><p className="mt-1 text-xs text-ink-subtle">{event.actor?.name ?? "Former Admin"} · {event.outcome.toLowerCase()}</p></li>)}</ul>}
        </Card>
      </div>
    </main>
  </div>;
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <Card className="min-w-0"><p className="text-sm text-ink-muted">{label}</p><p className="mt-2 break-words text-2xl font-bold text-ink">{value}</p>{hint && <p className="mt-2 text-xs leading-relaxed text-ink-muted">{hint}</p>}</Card>;
}
