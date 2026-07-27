/**
 * Report-building logic shared by the Reports page (on-screen table) and
 * both export routes (PDF/Excel) — this is the single place that decides
 * "what rows go in a Daily/Weekly/Monthly/Agent/Customer/Payout History
 * report", so the on-screen table and the exported file can never
 * disagree with each other.
 *
 * A report is represented as a generic `ReportTable` (title + columns +
 * rows + optional totals row) rather than six separate bespoke shapes —
 * this lets the PDF/Excel builders stay generic too (see pdf.ts / xlsx.ts).
 */
import "server-only";
import { listContributionsForReport } from "@/server/repositories/contribution.repository";
import { listPayoutsForReport } from "@/server/repositories/payout.repository";
import { toDateOnly, today, weekRange, monthRange } from "@/lib/date";
import { format } from "date-fns";

export type ReportType = "daily" | "weekly" | "monthly" | "agent" | "customer" | "payout";

export interface ReportColumn {
  key: string;
  label: string;
}

export interface ReportTable {
  title: string;
  subtitle: string;
  columns: ReportColumn[];
  rows: Record<string, string>[];
  /** Rendered the same way as a data row, but visually separated — e.g. "Total". */
  totalsRow?: Record<string, string>;
}

export interface ReportParams {
  type: ReportType;
  /** Anchor date (yyyy-MM-dd) for daily/weekly/monthly; ignored otherwise. */
  date?: string;
  /** Explicit range override — used by agent/customer/payout report types. */
  start?: string;
  end?: string;
  agentId?: string;
  agentName?: string;
  customerSearch?: string;
}

const CONTRIBUTION_COLUMNS: ReportColumn[] = [
  { key: "date", label: "Date" },
  { key: "customer", label: "Customer" },
  { key: "agent", label: "Agent" },
  { key: "status", label: "Status" },
  { key: "amount", label: "Amount (₦)" },
];

const PAYOUT_COLUMNS: ReportColumn[] = [
  { key: "receiptNumber", label: "Receipt #" },
  { key: "customer", label: "Customer" },
  { key: "totalSavings", label: "Total Savings (₦)" },
  { key: "method", label: "Method" },
  { key: "payoutDate", label: "Payout Date" },
  { key: "approvedBy", label: "Approved By" },
];

function parseAnchorDate(dateParam?: string): Date {
  if (!dateParam) return today();
  const parsed = new Date(dateParam);
  return Number.isNaN(parsed.getTime()) ? today() : toDateOnly(parsed);
}

function parseRangeDate(dateParam: string | undefined, fallback: Date): Date {
  if (!dateParam) return fallback;
  const parsed = new Date(dateParam);
  return Number.isNaN(parsed.getTime()) ? fallback : toDateOnly(parsed);
}

/** Resolve the effective [start, end] range for a report, given its type + params. */
function resolveRange(params: ReportParams): { start: Date; end: Date } {
  const anchor = parseAnchorDate(params.date);

  if (params.type === "daily") {
    return { start: anchor, end: anchor };
  }
  if (params.type === "weekly") {
    return weekRange(anchor);
  }
  if (params.type === "monthly") {
    return monthRange(anchor);
  }

  // agent / customer / payout: default to "this month" unless the caller
  // supplied an explicit start/end override.
  const defaultRange = monthRange(anchor);
  return {
    start: parseRangeDate(params.start, defaultRange.start),
    end: parseRangeDate(params.end, defaultRange.end),
  };
}

/** Build the full report table (rows + totals) for the given params. */
export async function buildReportTable(params: ReportParams): Promise<ReportTable> {
  if (params.type === "payout") {
    return buildPayoutReport(params);
  }
  return buildContributionReport(params);
}

async function buildContributionReport(params: ReportParams): Promise<ReportTable> {
  const { start, end } = resolveRange(params);

  const contributions = await listContributionsForReport({
    start,
    end,
    agentId: params.type === "agent" ? params.agentId : undefined,
    customerSearch: params.type === "customer" ? params.customerSearch : undefined,
  });

  const rows = contributions.map((contribution) => ({
    date: format(contribution.collectionDate, "dd MMM yyyy"),
    customer: contribution.customerProfile.user.name,
    agent: contribution.collectedBy.name,
    status: contribution.status,
    amount: contribution.status === "COLLECTED" ? Number(contribution.amount ?? 0).toLocaleString() : "—",
  }));

  const totalCollected = contributions
    .filter((c) => c.status === "COLLECTED")
    .reduce((sum, c) => sum + Number(c.amount ?? 0), 0);

  const labels: Record<ReportType, string> = {
    daily: "Daily Report",
    weekly: "Weekly Report",
    monthly: "Monthly Report",
    agent: "Agent Report",
    customer: "Customer Report",
    payout: "Payout History",
  };

  const scopeNote =
    params.type === "agent"
      ? ` — ${params.agentName ?? "Selected agent"}`
      : params.type === "customer" && params.customerSearch
        ? ` — matching "${params.customerSearch}"`
        : "";

  return {
    title: `${labels[params.type]}${scopeNote}`,
    subtitle: `${format(start, "dd MMM yyyy")} – ${format(end, "dd MMM yyyy")} · ${contributions.length} record(s)`,
    columns: CONTRIBUTION_COLUMNS,
    rows,
    totalsRow: {
      date: "",
      customer: "",
      agent: "",
      status: "Total Collected",
      amount: totalCollected.toLocaleString(),
    },
  };
}

async function buildPayoutReport(params: ReportParams): Promise<ReportTable> {
  const hasExplicitRange = Boolean(params.start || params.end);
  const start = hasExplicitRange ? parseRangeDate(params.start, undefined as unknown as Date) : undefined;
  const end = hasExplicitRange ? parseRangeDate(params.end, undefined as unknown as Date) : undefined;

  const payouts = await listPayoutsForReport({
    search: params.customerSearch,
    start,
    end,
  });

  const rows = payouts.map((payout) => ({
    receiptNumber: payout.receiptNumber,
    customer: payout.customerProfile.user.name,
    totalSavings: Number(payout.totalSavings).toLocaleString(),
    method: payout.payoutMethod === "CASH" ? "Cash" : "Bank Transfer",
    payoutDate: format(payout.payoutDate, "dd MMM yyyy"),
    approvedBy: payout.approvedBy.name,
  }));

  const totalPaidOut = payouts.reduce((sum, p) => sum + Number(p.totalSavings), 0);

  return {
    title: "Payout History",
    subtitle: hasExplicitRange
      ? `${start ? format(start, "dd MMM yyyy") : "…"} – ${end ? format(end, "dd MMM yyyy") : "…"} · ${payouts.length} payout(s)`
      : `All time · ${payouts.length} payout(s)`,
    columns: PAYOUT_COLUMNS,
    rows,
    totalsRow: {
      receiptNumber: "",
      customer: "",
      totalSavings: totalPaidOut.toLocaleString(),
      method: "Total Paid Out",
      payoutDate: "",
      approvedBy: "",
    },
  };
}
