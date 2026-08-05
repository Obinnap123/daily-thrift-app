import { requireRole } from "@/lib/session";
import { listCurrentTrackingRows } from "@/server/services/tracking.service";
import { listCustomerProfiles } from "@/server/repositories/customer.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { AllCustomerTrackingTable } from "@/components/dashboard/AllCustomerTrackingTable";
import { QuickPayButton } from "@/components/forms/QuickPayButton";

const links = [{ href: "/admin", label: "Overview" }, { href: "/admin/agents", label: "Agents" }, { href: "/admin/customers", label: "Customers" }, { href: "/admin/tracking", label: "Tracking" }, { href: "/admin/payouts", label: "Payouts" }, { href: "/admin/reconciliations", label: "Reconciliations" }, { href: "/admin/reports", label: "Reports" }, { href: "/admin/audit", label: "Audit Log" }, { href: "/admin/settings", label: "Settings" }];

export default async function AdminTrackingPage() {
  await requireRole("ADMIN");
  const [rows, customers] = await Promise.all([listCurrentTrackingRows(), listCustomerProfiles()]);
  const options = customers.map((customer) => ({ id: customer.id, name: customer.user.name, phone: customer.user.phone, customerCode: customer.customerCode }));
  return <div className="flex min-h-screen flex-col"><DashboardHeader title="Customer Tracking" /><DashboardNav links={links} /><main className="flex-1 space-y-4 p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">31-Day Tracking — All Customers</h2><p className="text-sm text-gray-500">The latest monthly sheet for every open savings period. Select a customer to see all previous sheets.</p></div><QuickPayButton customers={options} isAdmin label="Quick Pay" /></div><Card className="overflow-hidden p-0"><AllCustomerTrackingTable rows={rows} role="ADMIN" /></Card><p className="text-xs text-gray-500"><span className="mr-3 text-emerald-700">■ Paid</span><span>■ Pending or unavailable</span></p></main></div>;
}
