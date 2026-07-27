/**
 * Admin > Reports.
 * ----------------------------------------------------------------------------
 * A single page covering all six report types (Daily/Weekly/Monthly/Agent/
 * Customer/Payout History). The report type + its scoping inputs (date,
 * agent, customer search) all live in the URL's query string — this keeps
 * the page a plain Server Component (no client state needed to render the
 * table) and means a report's exact parameters are always shareable as a
 * link. The on-screen table is built by the exact same buildReportTable()
 * function the PDF/Excel export route uses, so what you see here always
 * matches what you download.
 */
import { requireRole } from "@/lib/session";
import { listActiveAgents } from "@/server/repositories/agent.repository";
import { buildReportTable, type ReportType } from "@/lib/reports/build-report";
import { today } from "@/lib/date";
import { format } from "date-fns";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { ReportFilterForm } from "@/components/forms/ReportFilterForm";
import { ExportButtons } from "@/components/forms/ExportButtons";

const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/reconciliations", label: "Reconciliations" },
  { href: "/admin/reports", label: "Reports" },
];

const VALID_TYPES: ReportType[] = ["daily", "weekly", "monthly", "agent", "customer", "payout"];

interface AdminReportsPageProps {
  searchParams: Promise<{
    type?: string;
    date?: string;
    start?: string;
    end?: string;
    agentId?: string;
    customerSearch?: string;
  }>;
}

export default async function AdminReportsPage({ searchParams }: AdminReportsPageProps) {
  await requireRole("ADMIN");

  const params = await searchParams;
  const type: ReportType = VALID_TYPES.includes(params.type as ReportType)
    ? (params.type as ReportType)
    : "daily";

  const activeAgents = await listActiveAgents();
  const selectedAgent = activeAgents.find((agent) => agent.id === params.agentId);

  const table = await buildReportTable({
    type,
    date: params.date ?? format(today(), "yyyy-MM-dd"),
    start: params.start,
    end: params.end,
    agentId: params.agentId,
    agentName: selectedAgent?.name,
    customerSearch: params.customerSearch,
  });

  // Query string forwarded to the export API so the downloaded file
  // matches exactly what's on screen.
  const exportParams = new URLSearchParams();
  exportParams.set("type", type);
  if (params.date) exportParams.set("date", params.date);
  if (params.start) exportParams.set("start", params.start);
  if (params.end) exportParams.set("end", params.end);
  if (params.agentId) {
    exportParams.set("agentId", params.agentId);
    if (selectedAgent) exportParams.set("agentName", selectedAgent.name);
  }
  if (params.customerSearch) exportParams.set("customerSearch", params.customerSearch);

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Admin Dashboard" />
      <DashboardNav links={ADMIN_NAV_LINKS} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Reports</h2>
          <p className="text-sm text-gray-500">
            Daily, weekly, monthly, agent, customer, and payout history reports — export to PDF
            or Excel at any time.
          </p>
        </div>

        <ReportFilterForm
          type={type}
          date={params.date ?? format(today(), "yyyy-MM-dd")}
          start={params.start}
          end={params.end}
          agentId={params.agentId}
          customerSearch={params.customerSearch}
          activeAgents={activeAgents}
        />

        <Card className="overflow-x-auto p-0">
          <div className="flex flex-col gap-2 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-gray-900">{table.title}</h3>
              <p className="text-sm text-gray-500">{table.subtitle}</p>
            </div>
            <ExportButtons exportQuery={exportParams.toString()} />
          </div>

          {table.rows.length === 0 ? (
            <p className="p-6 text-center text-gray-500">No records match this report.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
                <tr>
                  {table.columns.map((column) => (
                    <th key={column.key} className="px-4 py-3 font-medium">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {table.rows.map((row, index) => (
                  <tr key={index}>
                    {table.columns.map((column) => (
                      <td key={column.key} className="px-4 py-3 text-gray-700">
                        {row[column.key] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {table.totalsRow && (
                <tfoot className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
                  <tr>
                    {table.columns.map((column) => (
                      <td key={column.key} className="px-4 py-3">
                        {table.totalsRow![column.key] || ""}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </Card>
      </main>
    </div>
  );
}
