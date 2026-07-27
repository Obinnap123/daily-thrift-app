/**
 * Customer dashboard — own profile view.
 * ----------------------------------------------------------------------------
 * Enforces "Customers can only view their own ... profile": the profile is
 * looked up by the CURRENT SESSION's user id (`findCustomerProfileByUserId`),
 * never by an id supplied from the URL or a form — so there is no way for a
 * customer to view anyone else's data by manipulating a request.
 *
 * Savings balance, contribution history, and withdrawals will be added to
 * this page in later steps (Daily Contribution Recording / Savings Balance /
 * Withdrawals). For now this shows the customer's registered profile and
 * their currently assigned agent.
 */
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { findCustomerProfileByUserId } from "@/server/repositories/customer.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { format } from "date-fns";

export default async function CustomerDashboardPage() {
  const user = await requireRole("CUSTOMER");

  const profile = await findCustomerProfileByUserId(user.id);
  if (!profile) {
    // Should not normally happen (every CUSTOMER-role User is created together
    // with a CustomerProfile in a transaction), but guard against orphaned
    // accounts rather than crashing.
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Customer Dashboard" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Welcome, {profile.user.name}
          </h2>
          <p className="text-sm text-gray-500">
            Your savings balance and transaction history will appear here in
            an upcoming update.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Profile card */}
          <Card>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              My Profile
            </h3>
            <dl className="space-y-3 text-sm">
              <Row label="Full name" value={profile.user.name} />
              <Row label="Phone" value={profile.user.phone ?? "—"} />
              <Row label="ID number" value={profile.idNumber} />
              <Row
                label="Status"
                value={
                  <Badge tone={profile.user.isActive ? "green" : "red"}>
                    {profile.user.isActive ? "Active" : "Inactive"}
                  </Badge>
                }
              />
              <Row
                label="Customer since"
                value={format(profile.createdAt, "dd MMM yyyy")}
              />
            </dl>
          </Card>

          {/* Assigned agent card */}
          <Card>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              My Agent
            </h3>
            <p className="text-sm text-gray-600">
              Your daily contributions are collected by:
            </p>
            <p className="mt-2 text-base font-medium text-gray-900">
              {profile.assignedAgent.name}
            </p>
            {profile.assignedAgent.phone && (
              <p className="text-sm text-gray-500">{profile.assignedAgent.phone}</p>
            )}
            {profile.assignedAgent.email && (
              <p className="text-sm text-gray-500">{profile.assignedAgent.email}</p>
            )}
            <p className="mt-3 text-xs text-gray-400">
              If your agent changes, you&apos;ll see the updated name here
              automatically.
            </p>
          </Card>
        </div>

        {/* Placeholder for upcoming features */}
        <Card className="border-dashed">
          <p className="text-center text-sm text-gray-400">
            Savings balance, contribution history, and withdrawal requests
            will be available in a later update.
          </p>
        </Card>
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
