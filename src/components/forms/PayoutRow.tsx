"use client";

/**
 * One "Ready for Payout" table-row action: a button that expands into the
 * full RecordPayoutForm inline (kept inside the table cell rather than a
 * separate page/modal so the Admin can see the customer's context while
 * filling it in). On success, redirects straight to the printable receipt
 * page for the newly created payout.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { RecordPayoutForm } from "@/components/forms/RecordPayoutForm";

interface PayoutRowProps {
  contributionPlanId: string;
  customerName: string;
  dailyAmount: number;
  durationDays: number;
}

export function PayoutRow({ contributionPlanId, customerName }: PayoutRowProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <Button type="button" size="sm" onClick={() => setIsOpen(true)}>
        Record Payout
      </Button>
    );
  }

  return (
    <div className="w-72 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="mb-2 text-xs font-medium text-gray-500">Paying out {customerName}</p>
      <RecordPayoutForm
        contributionPlanId={contributionPlanId}
        onSuccess={(receiptNumber) => {
          router.push(`/admin/payouts/${receiptNumber}`);
        }}
      />
      <button
        type="button"
        onClick={() => setIsOpen(false)}
        className="mt-2 text-xs text-gray-500 hover:underline"
      >
        Cancel
      </button>
    </div>
  );
}
