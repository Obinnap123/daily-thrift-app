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
import { Modal } from "@/components/ui/Modal";
import { RecordPayoutForm } from "@/components/forms/RecordPayoutForm";

interface PayoutRowProps {
  contributionPlanId: string;
  customerName: string;
  dailyAmount: number;
  durationDays: number;
  grossSavings?: number;
  receiptBasePath?: string;
}

export function PayoutRow({ contributionPlanId, customerName, dailyAmount, grossSavings, receiptBasePath = "/admin/payouts" }: PayoutRowProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" className="w-full md:w-auto" onClick={() => setIsOpen(true)}>
        Record Payout
      </Button>
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Record payout"
        panelClassName="sm:max-w-xl"
      >
        <div className="mb-5 border-b border-line pb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-subtle">Customer</p>
          <p className="mt-1 text-lg font-semibold text-ink">{customerName}</p>
          <p className="mt-1 text-sm text-ink-muted">Confirm the completed external payment, then close this savings period.</p>
        </div>
        <RecordPayoutForm
          contributionPlanId={contributionPlanId}
          dailyAmount={dailyAmount}
          grossSavings={grossSavings}
          onSuccess={(receiptNumber) => {
            router.push(`${receiptBasePath}/${receiptNumber}`);
          }}
        />
        <Button type="button" variant="ghost" className="mt-3 w-full" onClick={() => setIsOpen(false)}>
          Cancel
        </Button>
      </Modal>
    </>
  );
}
