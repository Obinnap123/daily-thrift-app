/**
 * Agent > Contribution (Quick Pay) Receipt (printable).
 * ----------------------------------------------------------------------------
 * Same content as the Admin version, but scoped: an Agent may only view a
 * receipt for a payment they themselves collected (collectedById), never
 * another agent's — re-verified here server-side, not just relying on
 * "you can't guess someone else's receipt number".
 */
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { findContributionByReceiptNumber } from "@/server/repositories/contribution.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { ContributionReceiptCard } from "@/components/receipts/ContributionReceiptCard";

export default async function AgentContributionReceiptPage({
  params,
}: {
  params: Promise<{ receiptNumber: string }>;
}) {
  const user = await requireRole("AGENT");
  const { receiptNumber } = await params;

  const contribution = await findContributionByReceiptNumber(receiptNumber);
  if (!contribution || contribution.collectedBy.id !== user.id) {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="print:hidden">
        <DashboardHeader title="Agent Dashboard" />
      </div>
      <main className="flex-1 p-4 sm:p-6">
        <ContributionReceiptCard
          backHref="/agent"
          backLabel="Back to Dashboard"
          contribution={contribution}
        />
      </main>
    </div>
  );
}
