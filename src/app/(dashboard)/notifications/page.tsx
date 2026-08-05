import { requireRole } from "@/lib/session";
import { listNotifications } from "@/server/repositories/notification.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { NotificationList } from "@/components/dashboard/NotificationList";

export default async function NotificationsPage() {
  const user = await requireRole(["ADMIN", "AGENT"]);
  const items = await listNotifications(user.id);
  return <div className="flex min-h-screen flex-col"><DashboardHeader title="Notifications" /><main className="mx-auto w-full max-w-4xl flex-1 p-4 sm:p-6"><Card className="overflow-hidden p-0"><div className="border-b border-line p-5"><h2 className="text-lg font-semibold text-ink">Staff notifications</h2><p className="text-sm text-ink-muted">Saved operational alerts and payout activity.</p></div><NotificationList items={items} /></Card></main></div>;
}
