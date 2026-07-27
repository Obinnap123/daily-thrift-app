/**
 * Admin > Contribution (Quick Pay) Receipt (printable).
 * ----------------------------------------------------------------------------
 * Mirrors admin/payouts/[receiptNumber]/page.tsx exactly, but for a daily
 * Contribution payment's system-generated receipt number (e.g. "CR-000123")
 * instead of a Payout's ("PR-...").
 */
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { findContributionByReceiptNumber } from "@/server/repositories/contribution.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { ContributionReceiptCard } from "@/components/receipts/ContributionReceiptCard";

export default async function AdminContributionReceiptPage({
  params,
}: {
  params: Promise<{ receiptNumber: string }>;
}) {
  await requireRole("ADMIN");
  const { receiptNumber } = await params;

  const contribution = await findContributionByReceiptNumber(receiptNumber);
  if (!contribution) {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="print:hidden">
        <DashboardHeader title="Admin Dashboard" />
      </div>
      <main className="flex-1 p-4 sm:p-6">
        <ContributionReceiptCard
          backHref="/admin"
          backLabel="Back to Dashboard"
          contribution={contribution}
        />
      </main>
    </div>
  );
}
