/**
 * Agent > Customer Tracking page.
 * ----------------------------------------------------------------------------
 * The Agent-side equivalent of the Admin customer detail page, scoped to
 * ONLY the signed-in agent's own customers — enforced by checking
 * `customer.assignedAgentId !== user.id` below (never trusting the URL
 * alone; middleware already keeps a CUSTOMER/ADMIN off /agent routes, but
 * an Agent guessing another agent's customer id must still be blocked
 * here). Shows the customer's profile, savings summary, progress bar,
 * digital passbook / payment history, and a Quick Record Payment button —
 * everything an Agent needs to track one customer without leaving this
 * page. Unlike the Admin page, there is no Edit/Reassign/Delete here —
 * those remain Admin-only actions.
 */
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { findCustomerProfileById } from "@/server/repositories/customer.repository";
import { getActivePlanWithProgress } from "@/server/services/contribution-plan.service";
import { listContributionsForCustomer } from "@/server/repositories/contribution.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CustomerTrackingPanel } from "@/components/dashboard/CustomerTrackingPanel";
import { CustomerPhoto } from "@/components/customer/CustomerPhoto";
import { format } from "date-fns";
import Link from "next/link";

const AGENT_NAV_LINKS = [
  { href: "/agent", label: "Overview" },
  { href: "/agent/collections", label: "Today's Collections" },
  { href: "/agent/reconciliation", label: "End-of-Day Report" },
];

export default async function AgentCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("AGENT");
  const { id } = await params;

  const customer = await findCustomerProfileById(id);
  if (!customer || customer.assignedAgentId !== user.id) {
    notFound();
  }

  const [planWithProgress, passbookRows] = await Promise.all([
    getActivePlanWithProgress(customer.id),
    listContributionsForCustomer(customer.id),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Agent Dashboard" />
      <DashboardNav links={AGENT_NAV_LINKS} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/agent" className="text-sm font-medium text-emerald-700 hover:underline">
              &larr; Back to my customers
            </Link>
            <h2 className="mt-1 text-lg font-semibold text-gray-900">{customer.user.name}</h2>
            <p className="text-sm text-gray-500">
              Customer code: <span className="font-mono">{customer.customerCode}</span>
            </p>
          </div>
          <Badge tone={customer.user.isActive ? "green" : "red"}>
            {customer.user.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>

        {/* Profile */}
        <Card>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Profile
          </h3>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <CustomerPhoto
              customerProfileId={customer.id}
              hasPhoto={Boolean(customer.passportPhotoUrl)}
              alt={`${customer.user.name}'s passport photo`}
              className="shrink-0"
            />
          <dl className="grid min-w-0 flex-1 grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Row label="Customer code" value={customer.customerCode} />
            <Row label="Phone" value={customer.user.phone ?? "—"} />
            <Row label="ID number" value={customer.idNumber} />
            <Row label="Registered" value={format(customer.createdAt, "dd MMM yyyy")} />
          </dl>
          </div>
        </Card>

        <CustomerTrackingPanel
          customerProfileId={customer.id}
          planWithProgress={planWithProgress}
          passbookRows={passbookRows}
          isAdmin={false}
          quickPayCustomer={{
            id: customer.id,
            name: customer.user.name,
            phone: customer.user.phone,
            customerCode: customer.customerCode,
          }}
        />
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-start sm:gap-1">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900 sm:text-left">{value}</dd>
    </div>
  );
}
