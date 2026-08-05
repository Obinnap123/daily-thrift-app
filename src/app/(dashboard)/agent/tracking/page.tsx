import { requireRole } from "@/lib/session";
import { listCurrentTrackingRows } from "@/server/services/tracking.service";
import { listCustomerProfiles } from "@/server/repositories/customer.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { AllCustomerTrackingTable } from "@/components/dashboard/AllCustomerTrackingTable";
import { QuickPayButton } from "@/components/forms/QuickPayButton";

const links = [{ href: "/agent", label: "Overview" }, { href: "/agent/tracking", label: "Tracking" }, { href: "/agent/payouts", label: "Payouts" }, { href: "/agent/collections", label: "Today's Collections" }, { href: "/agent/reconciliation", label: "End-of-Day Report" }];

export default async function AgentTrackingPage() {
  const user = await requireRole("AGENT");
  const [rows, customers] = await Promise.all([listCurrentTrackingRows(user.id), listCustomerProfiles({ agentId: user.id })]);
  const options = customers.map((customer) => ({ id: customer.id, name: customer.user.name, phone: customer.user.phone, customerCode: customer.customerCode }));
  return <div className="flex min-h-screen flex-col"><DashboardHeader title="Customer Tracking" /><DashboardNav links={links} /><main className="flex-1 space-y-4 p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">31-Day Tracking — My Customers</h2><p className="text-sm text-gray-500">Payments fill the oldest unpaid calendar cells and continue across monthly sheets.</p></div><QuickPayButton customers={options} isAdmin={false} label="Quick Pay" /></div><Card className="overflow-hidden p-0"><AllCustomerTrackingTable rows={rows} role="AGENT" /></Card></main></div>;
}
