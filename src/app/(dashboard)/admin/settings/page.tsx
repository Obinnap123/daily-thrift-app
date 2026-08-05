import { requireRole } from "@/lib/session";
import { getBusinessSettings } from "@/server/services/settings.service";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { SettingsForm } from "@/components/forms/SettingsForm";

const links = [
  { href: "/admin", label: "Overview" }, { href: "/admin/agents", label: "Agents" }, { href: "/admin/customers", label: "Customers" }, { href: "/admin/tracking", label: "Tracking" },
  { href: "/admin/payouts", label: "Payouts" }, { href: "/admin/reconciliations", label: "Reconciliations" }, { href: "/admin/reports", label: "Reports" }, { href: "/admin/audit", label: "Audit Log" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function SettingsPage() {
  await requireRole("ADMIN");
  const settings = await getBusinessSettings();
  return <div className="flex min-h-screen flex-col"><DashboardHeader title="Settings" /><DashboardNav links={links} /><main className="flex-1 p-4 sm:p-6"><Card className="mx-auto max-w-4xl"><div className="mb-6"><h2 className="text-lg font-semibold">Business and operational rules</h2><p className="text-sm text-gray-500">Changes apply to future payouts; historical payout snapshots remain unchanged.</p></div><SettingsForm initial={{ ...settings, supportPhone: settings.supportPhone ?? "", supportEmail: settings.supportEmail ?? "", businessAddress: settings.businessAddress ?? "", receiptFooter: settings.receiptFooter ?? "" }} /></Card></main></div>;
}
