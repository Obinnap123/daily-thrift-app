/**
 * Agent dashboard — placeholder for Step 1.
 * Field collectors will use this to register customers and record daily
 * contributions in later steps.
 */
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { Card } from "@/components/ui/Card";

export default function AgentDashboardPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Agent Dashboard" />
      <main className="flex-1 p-4 sm:p-6">
        <Card>
          <p className="text-gray-600">
            Welcome, Agent. This dashboard will host customer registration
            and daily contribution recording tools in upcoming steps.
          </p>
        </Card>
      </main>
    </div>
  );
}
