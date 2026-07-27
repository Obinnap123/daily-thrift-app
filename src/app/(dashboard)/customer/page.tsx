/**
 * Customer dashboard — placeholder for Step 1.
 * Customers will view their savings balance, contribution history, and
 * request withdrawals here in later steps.
 */
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { Card } from "@/components/ui/Card";

export default function CustomerDashboardPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Customer Dashboard" />
      <main className="flex-1 p-4 sm:p-6">
        <Card>
          <p className="text-gray-600">
            Welcome. This dashboard will show your savings balance,
            contribution history, and withdrawal requests in upcoming steps.
          </p>
        </Card>
      </main>
    </div>
  );
}
