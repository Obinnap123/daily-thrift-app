import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { findPayoutByReceiptNumber } from "@/server/repositories/payout.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { PrintButton } from "@/components/forms/PrintButton";
import { format } from "date-fns";

export default async function AgentPayoutReceipt({ params }: { params: Promise<{ receiptNumber: string }> }) {
  const user = await requireRole("AGENT");
  const { receiptNumber } = await params;
  const payout = await findPayoutByReceiptNumber(receiptNumber);
  if (!payout || payout.customerProfile.assignedAgentId !== user.id) notFound();
  return <div className="flex min-h-screen flex-col"><DashboardHeader title="Payout Receipt" /><main className="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-6"><Card><div className="mb-5 flex justify-between"><div><p className="text-sm text-gray-500">Receipt</p><h2 className="font-mono text-xl font-bold">{payout.receiptNumber}</h2></div><PrintButton /></div><dl className="space-y-3 text-sm"><Row label="Customer" value={payout.customerProfile.user.name} /><Row label="Gross savings" value={`₦${Number(payout.grossSavings).toLocaleString()}`} /><Row label="Company commission" value={`₦${Number(payout.commissionAmount).toLocaleString()}`} /><Row label="Customer received" value={`₦${Number(payout.customerAmount).toLocaleString()}`} /><Row label="Method" value={payout.payoutMethod === "CASH" ? "Cash" : "Bank transfer"} /><Row label="Date" value={format(payout.payoutDate, "dd MMMM yyyy")} /><Row label="Processed by" value={payout.approvedBy.name} /></dl></Card></main></div>;
}
function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 border-b border-gray-100 pb-2"><dt className="text-gray-500">{label}</dt><dd className="font-medium">{value}</dd></div>; }
