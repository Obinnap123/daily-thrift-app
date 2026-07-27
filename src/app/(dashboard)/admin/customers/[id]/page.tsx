/**
 * Admin > Customer detail page.
 * Shows the customer's profile (incl. customer code + passport photo), an
 * Edit form, the passport-photo upload/replace control, their full
 * agent-assignment history (audit trail), and a form to rotate them to a
 * different agent.
 */
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { findCustomerProfileById } from "@/server/repositories/customer.repository";
import { listActiveAgents } from "@/server/repositories/agent.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ReassignAgentForm } from "@/components/forms/ReassignAgentForm";
import { EditCustomerForm } from "@/components/forms/EditCustomerForm";
import { PassportPhotoUpload } from "@/components/forms/PassportPhotoUpload";
import { CreatePlanForm } from "@/components/forms/CreatePlanForm";
import { getActivePlanWithProgress } from "@/server/services/contribution-plan.service";
import { listPayoutsForCustomer } from "@/server/repositories/payout.repository";
import { format } from "date-fns";

const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/reconciliations", label: "Reconciliations" },
  { href: "/admin/reports", label: "Reports" },
];

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;

  const customer = await findCustomerProfileById(id);
  if (!customer) {
    notFound();
  }

  const [activeAgents, planWithProgress, payoutHistory] = await Promise.all([
    listActiveAgents(),
    getActivePlanWithProgress(customer.id),
    listPayoutsForCustomer(customer.id),
  ]);
  const availableAgentsForReassignment = activeAgents.filter(
    (agent) => agent.id !== customer.assignedAgentId
  );

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Admin Dashboard" />
      <DashboardNav links={ADMIN_NAV_LINKS} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{customer.user.name}</h2>
            <p className="text-sm text-gray-500">
              Customer code: <span className="font-mono">{customer.customerCode}</span>
            </p>
          </div>
          <Badge tone={customer.user.isActive ? "green" : "red"}>
            {customer.user.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Profile details (read-only summary) */}
          <Card className="lg:col-span-1">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Profile
            </h3>
            <dl className="space-y-3 text-sm">
              <Row label="Customer code" value={customer.customerCode} />
              <Row label="ID number" value={customer.idNumber} />
              <Row
                label="Registered"
                value={format(customer.createdAt, "dd MMM yyyy, h:mm a")}
              />
              <Row label="Current agent" value={customer.assignedAgent.name} />
            </dl>
          </Card>

          {/* Edit form */}
          <Card className="lg:col-span-1">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Edit Customer
            </h3>
            <EditCustomerForm
              customer={{
                id: customer.id,
                fullName: customer.user.name,
                phone: customer.user.phone,
                idNumber: customer.idNumber,
              }}
            />
          </Card>

          {/* Passport photo */}
          <Card className="lg:col-span-1">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Passport Photo
            </h3>
            <PassportPhotoUpload
              customerProfileId={customer.id}
              currentPhotoUrl={customer.passportPhotoUrl}
            />
          </Card>

          {/* Reassignment form */}
          <Card className="lg:col-span-1">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Rotate Agent
            </h3>
            <ReassignAgentForm
              customerProfileId={customer.id}
              availableAgents={availableAgentsForReassignment}
            />
          </Card>

          {/* Savings plan: progress if one is active, otherwise a form to start one */}
          <Card className="lg:col-span-1">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Savings Plan
            </h3>
            {planWithProgress ? (
              <dl className="space-y-3 text-sm">
                <Row
                  label="Daily amount"
                  value={`₦${Number(planWithProgress.plan.dailyAmount).toLocaleString()}`}
                />
                <Row label="Total saved" value={`₦${planWithProgress.progress.totalSaved.toLocaleString()}`} />
                <Row label="Days paid" value={String(planWithProgress.progress.daysPaid)} />
                <Row label="Days missed" value={String(planWithProgress.progress.daysMissed)} />
                <Row label="Days remaining" value={String(planWithProgress.progress.daysRemaining)} />
                <Row
                  label="Ref. maturity date"
                  value={format(planWithProgress.plan.expectedMaturityDate, "dd MMM yyyy")}
                />
                <Row label="Status" value={<Badge tone="blue">{planWithProgress.plan.status}</Badge>} />
              </dl>
            ) : (
              <>
                <p className="mb-3 text-sm text-gray-500">
                  No active savings plan. Start one to begin recording daily contributions.
                </p>
                <CreatePlanForm customerProfileId={customer.id} />
              </>
            )}
          </Card>

          {/* Payout history for this customer */}
          {payoutHistory.length > 0 && (
            <Card className="lg:col-span-1">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Payout History
              </h3>
              <ul className="space-y-3 text-sm">
                {payoutHistory.map((payout) => (
                  <li key={payout.id} className="border-l-2 border-emerald-200 pl-3">
                    <p className="font-medium text-gray-900">
                      ₦{Number(payout.totalSavings).toLocaleString()} · {payout.payoutMethod === "CASH" ? "Cash" : "Bank Transfer"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {format(payout.payoutDate, "dd MMM yyyy")} · Receipt {payout.receiptNumber} · approved by{" "}
                      {payout.approvedBy.name}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Assignment history / audit trail */}
          <Card className="lg:col-span-2">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Assignment History
            </h3>
            <ol className="space-y-4">
              {customer.assignmentLogs.map((logEntry) => (
                <li key={logEntry.id} className="border-l-2 border-emerald-200 pl-3">
                  <p className="text-sm font-medium text-gray-900">
                    {logEntry.previousAgent
                      ? `${logEntry.previousAgent.name} → ${logEntry.newAgent.name}`
                      : `Initially assigned to ${logEntry.newAgent.name}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    {format(logEntry.createdAt, "dd MMM yyyy, h:mm a")} · by{" "}
                    {logEntry.changedBy.name}
                  </p>
                  {logEntry.note && (
                    <p className="mt-1 text-xs text-gray-600 italic">&ldquo;{logEntry.note}&rdquo;</p>
                  )}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{value}</dd>
    </div>
  );
}
