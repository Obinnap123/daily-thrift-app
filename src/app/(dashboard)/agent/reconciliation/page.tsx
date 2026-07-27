/**
 * Agent > End-of-Day Report.
 * ----------------------------------------------------------------------------
 * Shows today's expected cash (computed server-side from this agent's own
 * COLLECTED Contribution rows for today) and lets the agent submit how much
 * cash they actually have on hand. Once submitted for today, the form is
 * replaced with a read-only "submitted, awaiting review" summary — an agent
 * can only submit once per day (enforced by the DB's
 * @@unique([agentId, reconciliationDate]) and by submitReconciliation()).
 *
 * Below that, the agent's own submission history (with Admin's decision, if
 * reviewed) is listed for reference.
 */
import { requireRole } from "@/lib/session";
import { sumCollectedByAgent } from "@/server/repositories/contribution.repository";
import {
  findReconciliationForAgentAndDate,
  listReconciliationsForAgent,
} from "@/server/repositories/reconciliation.repository";
import { today } from "@/lib/date";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SubmitReconciliationForm } from "@/components/forms/SubmitReconciliationForm";
import { format } from "date-fns";

const AGENT_NAV_LINKS = [
  { href: "/agent", label: "Overview" },
  { href: "/agent/collections", label: "Today's Collections" },
  { href: "/agent/reconciliation", label: "End-of-Day Report" },
];

const STATUS_TONE = { SUBMITTED: "amber", APPROVED: "green", REJECTED: "red" } as const;

export default async function AgentReconciliationPage() {
  const user = await requireRole("AGENT");

  const [expectedCashToday, todaysReport, history] = await Promise.all([
    sumCollectedByAgent(user.id, { start: today(), end: today() }),
    findReconciliationForAgentAndDate(user.id, today()),
    listReconciliationsForAgent(user.id),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Agent Dashboard" />
      <DashboardNav links={AGENT_NAV_LINKS} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">End-of-Day Report</h2>
          <p className="text-sm text-gray-500">
            Reconcile your cash on hand against today&apos;s recorded collections for{" "}
            {today().toLocaleDateString()}.
          </p>
        </div>

        <Card className="mx-auto max-w-md">
          {todaysReport ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Today&apos;s Report
                </h3>
                <Badge tone={STATUS_TONE[todaysReport.status]}>{todaysReport.status}</Badge>
              </div>
              <SummaryRow label="Expected cash" value={`₦${Number(todaysReport.expectedCash).toLocaleString()}`} />
              <SummaryRow label="Actual cash submitted" value={`₦${Number(todaysReport.actualCash).toLocaleString()}`} />
              {todaysReport.agentNote && (
                <p className="text-xs italic text-gray-500">
                  Your note: &ldquo;{todaysReport.agentNote}&rdquo;
                </p>
              )}
              {todaysReport.status !== "SUBMITTED" && (
                <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  Reviewed{" "}
                  {todaysReport.reviewedAt ? format(todaysReport.reviewedAt, "dd MMM yyyy, h:mm a") : ""}
                  {todaysReport.reviewNote && ` — "${todaysReport.reviewNote}"`}
                </p>
              )}
              {todaysReport.status === "SUBMITTED" && (
                <p className="text-xs text-gray-500">
                  Submitted — waiting for Admin to approve or reject.
                </p>
              )}
            </div>
          ) : (
            <>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Submit Today&apos;s Report
              </h3>
              <SubmitReconciliationForm expectedCash={expectedCashToday} />
            </>
          )}
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            My Report History
          </h3>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500">No reports submitted yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-500">
                <tr>
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Expected</th>
                  <th className="py-2 font-medium">Actual</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((report) => (
                  <tr key={report.id}>
                    <td className="py-2">{format(report.reconciliationDate, "dd MMM yyyy")}</td>
                    <td className="py-2">₦{Number(report.expectedCash).toLocaleString()}</td>
                    <td className="py-2">₦{Number(report.actualCash).toLocaleString()}</td>
                    <td className="py-2">
                      <Badge tone={STATUS_TONE[report.status]}>{report.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </main>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
