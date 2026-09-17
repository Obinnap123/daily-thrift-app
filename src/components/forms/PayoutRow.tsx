"use client";

/**
 * Payout action for one eligible customer. The responsive dialog keeps the
 * list compact while allowing the operator to select arbitrary unpaid months.
 * On success it opens the immutable printable receipt.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { RecordPayoutForm } from "@/components/forms/RecordPayoutForm";
import type { PayoutMonthOption } from "@/lib/payout-selection";

interface PayoutRowProps {
  contributionPlanId: string;
  customerName: string;
  months: PayoutMonthOption[];
  commissionDays?: number;
  receiptBasePath?: string;
}

export function PayoutRow({ contributionPlanId, customerName, months, commissionDays = 1, receiptBasePath = "/admin/payouts" }: PayoutRowProps) {
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
          <p className="mt-1 text-sm text-ink-muted">Choose a full payout or select months and amounts for a partial payout.</p>
        </div>
        <RecordPayoutForm
          contributionPlanId={contributionPlanId}
          months={months}
          commissionDays={commissionDays}
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
