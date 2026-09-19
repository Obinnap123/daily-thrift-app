import Link from "next/link";
import { format } from "date-fns";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";

export default async function AdminActivityDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("SUPER_ADMIN");
  const { id } = await params;
  const event = await prisma.auditLog.findFirst({ where: { id, actorRole: "ADMIN" }, include: { actor: { select: { name: true, email: true } } } });
  if (!event) notFound();

  const payout = event.entityType === "Payout" && event.entityId
    ? await prisma.payout.findUnique({ where: { id: event.entityId }, select: { receiptNumber: true, payoutDate: true, grossSavings: true, commissionAmount: true, customerAmount: true, scope: true, customerProfile: { select: { customerCode: true, user: { select: { name: true } } } }, months: { select: { monthStart: true, grossSavings: true, commissionAmount: true, customerAmount: true }, orderBy: { monthStart: "asc" } } } })
    : null;
  const contribution = event.entityType === "Contribution" && event.entityId
    ? await prisma.contribution.findUnique({ where: { id: event.entityId }, select: { receiptNumber: true, collectionDate: true, status: true, amount: true, customerProfile: { select: { customerCode: true, user: { select: { name: true } } } } } })
    : null;
  const relatedUser = event.entityType === "User" && event.entityId
    ? await prisma.user.findUnique({ where: { id: event.entityId }, select: { name: true, role: true, isActive: true } })
    : null;

  return <div className="flex min-h-screen flex-col"><DashboardHeader title="Admin activity" /><DashboardNav /><main className="flex-1 space-y-5 p-4 sm:p-6">
    <Link href="/super-admin/activity" className="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline">← Back to activity</Link>
    <div><h2 className="text-xl font-semibold text-ink">{event.action.replaceAll("_", " ")}</h2><p className="mt-1 text-sm text-ink-muted">Read-only record of what happened.</p></div>
    <Card className="space-y-3"><Detail label="Outcome" value={event.outcome} /><Detail label="When" value={format(event.createdAt, "dd MMM yyyy, h:mm a")} /><Detail label="Performed by" value={event.actor?.name ?? "Former Admin"} /><Detail label="Summary" value={event.summary} />{event.entityType && <Detail label="Record type" value={event.entityType} />}</Card>
    {payout && <Card className="space-y-3"><h3 className="font-semibold text-ink">Related payout · {payout.receiptNumber}</h3><Detail label="Customer" value={`${payout.customerProfile.user.name} (${payout.customerProfile.customerCode})`} /><Detail label="Date" value={format(payout.payoutDate, "dd MMM yyyy")} /><Detail label="Type" value={payout.scope === "FULL" ? "Full payout" : "Partial payout"} /><Detail label="Savings settled" value={`₦${Number(payout.grossSavings).toLocaleString()}`} /><Detail label="Commission" value={`₦${Number(payout.commissionAmount).toLocaleString()}`} /><Detail label="Customer received" value={`₦${Number(payout.customerAmount).toLocaleString()}`} /><div className="border-t border-line pt-3"><p className="mb-2 text-sm font-semibold text-ink">Months included</p>{payout.months.map((month) => <p key={month.monthStart.toISOString()} className="text-sm text-ink-muted">{format(month.monthStart, "MMMM yyyy")}: ₦{Number(month.grossSavings).toLocaleString()} saved · ₦{Number(month.commissionAmount).toLocaleString()} commission</p>)}</div></Card>}
    {contribution && <Card className="space-y-3"><h3 className="font-semibold text-ink">Related payment · {contribution.receiptNumber ?? "No receipt"}</h3><Detail label="Customer" value={`${contribution.customerProfile.user.name} (${contribution.customerProfile.customerCode})`} /><Detail label="Date" value={format(contribution.collectionDate, "dd MMM yyyy")} /><Detail label="Status" value={contribution.status} /><Detail label="Amount" value={`₦${Number(contribution.amount ?? 0).toLocaleString()}`} /></Card>}
    {relatedUser && <Card className="space-y-3"><h3 className="font-semibold text-ink">Related account</h3><Detail label="Name" value={relatedUser.name} /><Detail label="Role now" value={relatedUser.role.replaceAll("_", " ")} /><Detail label="Status" value={relatedUser.isActive ? "Active" : "Inactive"} /></Card>}
    {!payout && !contribution && !relatedUser && event.entityType && <p className="text-sm text-ink-muted">The event summary is the available record context. No separate read-only detail is available for this record type.</p>}
  </main></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-0.5 border-b border-line pb-3 last:border-0 last:pb-0 sm:grid-cols-[12rem_1fr]"><span className="text-sm text-ink-muted">{label}</span><span className="min-w-0 break-words text-sm font-medium text-ink">{value}</span></div>;
}
