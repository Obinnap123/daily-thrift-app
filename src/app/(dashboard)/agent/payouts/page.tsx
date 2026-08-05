import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { listPlansReadyForPayout } from "@/server/repositories/contribution-plan.repository";
import { prisma } from "@/lib/prisma";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { PayoutRow } from "@/components/forms/PayoutRow";

const links = [
  { href: "/agent", label: "Overview" },
  { href: "/agent/tracking", label: "Tracking" },
  { href: "/agent/payouts", label: "Payouts" },
  { href: "/agent/collections", label: "Today's Collections" },
  { href: "/agent/reconciliation", label: "End-of-Day Report" },
];

export default async function AgentPayoutsPage() {
  const user = await requireRole("AGENT");
  const [plans, history] = await Promise.all([
    listPlansReadyForPayout({ agentId: user.id }),
    prisma.payout.findMany({
      where: { customerProfile: { assignedAgentId: user.id } },
      include: {
        customerProfile: { include: { user: { select: { name: true } } } },
        approvedBy: { select: { name: true } },
      },
      orderBy: { payoutDate: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Payouts" />
      <DashboardNav links={links} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-ink">Eligible customers</h2>
          <p className="text-sm text-ink-muted">You may immediately complete payouts for customers assigned to you.</p>
        </div>

        <Card className="overflow-hidden p-0">
          {plans.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-muted">No customers currently meet the minimum payout requirement.</p>
          ) : (
            <>
              <div className="grid gap-3 p-3 md:hidden">
                {plans.map((plan) => {
                  const grossSavings = plan.contributions.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
                  return (
                    <article key={plan.id} className="rounded-xl border border-line bg-surface p-4">
                      <h3 className="font-semibold text-ink">{plan.customerProfile.user.name}</h3>
                      <dl className="my-4 grid grid-cols-2 gap-3 border-y border-line py-3 text-sm">
                        <div><dt className="text-xs text-ink-subtle">Funded days</dt><dd className="mt-1 font-medium tabular-nums text-ink">{plan._count.allocations}</dd></div>
                        <div><dt className="text-xs text-ink-subtle">Gross savings</dt><dd className="mt-1 font-medium tabular-nums text-ink">₦{grossSavings.toLocaleString()}</dd></div>
                      </dl>
                      <PayoutRow contributionPlanId={plan.id} customerName={plan.customerProfile.user.name} dailyAmount={Number(plan.dailyAmount)} durationDays={31} grossSavings={grossSavings} receiptBasePath="/agent/payouts" />
                    </article>
                  );
                })}
              </div>
              <table className="hidden w-full text-left text-sm md:table">
                <thead className="border-b border-line bg-surface-muted text-ink-muted">
                  <tr><th scope="col" className="px-4 py-3">Customer</th><th scope="col" className="px-4 py-3">Funded days</th><th scope="col" className="px-4 py-3">Gross savings</th><th scope="col" className="px-4 py-3">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {plans.map((plan) => {
                    const grossSavings = plan.contributions.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
                    return (
                      <tr key={plan.id}>
                        <td className="px-4 py-3 font-medium text-ink">{plan.customerProfile.user.name}</td>
                        <td className="px-4 py-3 tabular-nums text-ink-muted">{plan._count.allocations}</td>
                        <td className="px-4 py-3 tabular-nums text-ink-muted">₦{grossSavings.toLocaleString()}</td>
                        <td className="px-4 py-3"><PayoutRow contributionPlanId={plan.id} customerName={plan.customerProfile.user.name} dailyAmount={Number(plan.dailyAmount)} durationDays={31} grossSavings={grossSavings} receiptBasePath="/agent/payouts" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </Card>

        <div>
          <h2 className="text-lg font-semibold text-ink">Payout history</h2>
          <p className="text-sm text-ink-muted">Payouts for your currently assigned customers.</p>
        </div>
        <Card className="overflow-x-auto p-0">
          {history.length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-muted">No payouts recorded.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-surface-muted text-ink-muted"><tr><th scope="col" className="px-4 py-3">Receipt</th><th scope="col" className="px-4 py-3">Customer</th><th scope="col" className="px-4 py-3">Customer received</th><th scope="col" className="px-4 py-3">Date</th><th scope="col" className="px-4 py-3">Processed by</th></tr></thead>
              <tbody className="divide-y divide-line">
                {history.map((payout) => <tr key={payout.id}><td className="px-4 py-3 font-mono text-xs">{payout.receiptNumber}</td><td className="px-4 py-3">{payout.customerProfile.user.name}</td><td className="px-4 py-3 tabular-nums">₦{Number(payout.customerAmount).toLocaleString()}</td><td className="px-4 py-3">{format(payout.payoutDate, "dd MMM yyyy")}</td><td className="px-4 py-3">{payout.approvedBy.name}</td></tr>)}
              </tbody>
            </table>
          )}
        </Card>
      </main>
    </div>
  );
}
