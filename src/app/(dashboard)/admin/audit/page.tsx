import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { format } from "date-fns";

const links = [{ href: "/admin", label: "Overview" }, { href: "/admin/agents", label: "Agents" }, { href: "/admin/customers", label: "Customers" }, { href: "/admin/tracking", label: "Tracking" }, { href: "/admin/payouts", label: "Payouts" }, { href: "/admin/reconciliations", label: "Reconciliations" }, { href: "/admin/reports", label: "Reports" }, { href: "/admin/audit", label: "Audit Log" }, { href: "/admin/settings", label: "Settings" }];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; outcome?: string }> }) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const logs = await prisma.auditLog.findMany({
    where: {
      ...(params.outcome === "SUCCESS" || params.outcome === "FAILURE" ? { outcome: params.outcome } : {}),
      ...(params.q ? { OR: [{ action: { contains: params.q, mode: "insensitive" } }, { summary: { contains: params.q, mode: "insensitive" } }, { actor: { name: { contains: params.q, mode: "insensitive" } } }] } : {}),
    },
    include: { actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200,
  });
  return <div className="flex min-h-screen flex-col"><DashboardHeader title="Audit Log" /><DashboardNav links={links} /><main className="flex-1 space-y-4 p-4 sm:p-6"><form className="flex flex-wrap gap-2"><input name="q" defaultValue={params.q} placeholder="Search action, person or details" className="min-w-64 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" /><select name="outcome" defaultValue={params.outcome ?? ""} className="rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">All outcomes</option><option value="SUCCESS">Success</option><option value="FAILURE">Failure</option></select><button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white">Filter</button></form><Card className="overflow-x-auto p-0">{logs.length === 0 ? <p className="p-6 text-center text-gray-500">No audit events found.</p> : <table className="w-full text-left text-sm"><thead className="border-b bg-gray-50 text-gray-600"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Outcome</th><th className="px-4 py-3">Details</th></tr></thead><tbody className="divide-y">{logs.map((log) => <tr key={log.id}><td className="whitespace-nowrap px-4 py-3 text-gray-500">{format(log.createdAt, "dd MMM yyyy, h:mm a")}</td><td className="px-4 py-3">{log.actor?.name ?? "System"}<span className="block text-xs text-gray-400">{log.actorRole ?? "—"}</span></td><td className="px-4 py-3 font-medium">{log.action.replaceAll("_", " ")}</td><td className="px-4 py-3"><Badge tone={log.outcome === "SUCCESS" ? "green" : "red"}>{log.outcome}</Badge></td><td className="max-w-xl px-4 py-3 text-gray-600">{log.summary}</td></tr>)}</tbody></table>}</Card></main></div>;
}
