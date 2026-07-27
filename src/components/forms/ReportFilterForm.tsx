"use client";

/**
 * Report type + scope selector for the Reports page.
 * ----------------------------------------------------------------------------
 * A plain GET <form> (no fetch/Server Action) — submitting it just
 * navigates to /admin/reports?type=...&... , which the Server Component
 * page reads directly. This keeps the actual report data-fetching 100%
 * server-side and makes every report configuration a shareable URL.
 *
 * Only the fields relevant to the selected report type are shown:
 *  - daily/weekly/monthly: a single anchor date
 *  - agent: an agent dropdown + optional date range override
 *  - customer: a free-text name/code search + optional date range override
 *  - payout: optional date range only (no scope needed — it's all payouts)
 */
import { useState } from "react";
import type { ReportType } from "@/lib/reports/build-report";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { AgentOption } from "@/server/repositories/agent.repository";

interface ReportFilterFormProps {
  type: ReportType;
  date: string;
  start?: string;
  end?: string;
  agentId?: string;
  customerSearch?: string;
  activeAgents: AgentOption[];
}

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  agent: "Agent",
  customer: "Customer",
  payout: "Payout History",
};

export function ReportFilterForm({
  type,
  date,
  start,
  end,
  agentId,
  customerSearch,
  activeAgents,
}: ReportFilterFormProps) {
  const [selectedType, setSelectedType] = useState<ReportType>(type);

  const showAnchorDate = selectedType === "daily" || selectedType === "weekly" || selectedType === "monthly";
  const showAgentPicker = selectedType === "agent";
  const showCustomerSearch = selectedType === "customer";
  const showDateRange = selectedType === "agent" || selectedType === "customer" || selectedType === "payout";

  return (
    <Card>
      <form method="GET" action="/admin/reports" className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-48">
          <Select
            label="Report type"
            name="type"
            value={selectedType}
            onChange={(event) => setSelectedType(event.target.value as ReportType)}
          >
            {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {showAnchorDate && (
          <div className="w-full sm:w-48">
            <Input label="Date" type="date" name="date" defaultValue={date} />
          </div>
        )}

        {showAgentPicker && (
          <div className="w-full sm:w-56">
            <Select label="Agent" name="agentId" defaultValue={agentId ?? ""}>
              <option value="">Select an agent…</option>
              {activeAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </Select>
          </div>
        )}

        {showCustomerSearch && (
          <div className="w-full sm:w-56">
            <Input
              label="Customer name or code"
              name="customerSearch"
              placeholder="e.g. Jane Doe or DDT-000123"
              defaultValue={customerSearch}
            />
          </div>
        )}

        {showDateRange && (
          <>
            <div className="w-full sm:w-40">
              <Input label="From (optional)" type="date" name="start" defaultValue={start} />
            </div>
            <div className="w-full sm:w-40">
              <Input label="To (optional)" type="date" name="end" defaultValue={end} />
            </div>
          </>
        )}

        <Button type="submit">Run Report</Button>
      </form>
    </Card>
  );
}
