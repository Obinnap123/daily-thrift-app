import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { AdminAccountControls } from "./AdminAccountControls";

export default async function SuperAdminAccountsPage() {
  await requireRole("SUPER_ADMIN");
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, email: true, isActive: true, emailVerifiedAt: true, lastLoginAt: true } });
  return <div className="flex min-h-screen flex-col"><DashboardHeader title="Admin account" /><DashboardNav /><main className="flex-1 space-y-5 p-4 sm:p-6"><div><h2 className="text-xl font-semibold text-ink">Manage Admin access</h2><p className="mt-1 text-sm text-ink-muted">Invite the regular Admin, monitor verification, or revoke access. Financial records and historical actions remain unchanged.</p></div><AdminAccountControls admins={admins} /></main></div>;
}
