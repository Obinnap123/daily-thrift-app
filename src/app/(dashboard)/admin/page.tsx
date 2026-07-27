/**
 * Admin dashboard — placeholder for Step 1.
 * Confirms role-based auth + routing works end-to-end. Real widgets
 * (collection summaries, agent performance, etc.) are added in later steps.
 */
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { Card } from "@/components/ui/Card";

export default function AdminDashboardPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Admin Dashboard" />
      <main className="flex-1 p-4 sm:p-6">
        <Card>
          <p className="text-gray-600">
            Welcome, Admin. This dashboard will host system-wide reports,
            agent &amp; customer management, and audit logs in upcoming
            steps.
          </p>
        </Card>
      </main>
    </div>
  );
}
