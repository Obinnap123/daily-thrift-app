"use client";

/**
 * Record a manual payout for a customer whose savings cycle is COMPLETED —
 * Admin only. This form IS the "Mark as Paid" action (see recordPayout()
 * service comment); there is no separate status toggle.
 *
 * Reminder shown to the Admin: this system does NOT move money — the
 * payout must already have happened in cash or via a bank transfer made
 * outside this application before this form is submitted.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import { recordPayoutSchema, type RecordPayoutInput } from "@/validations/payout";
import { recordPayoutAction } from "@/server/actions/payout.actions";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";
import { format } from "date-fns";

interface RecordPayoutFormProps {
  contributionPlanId: string;
  dailyAmount?: number;
  grossSavings?: number;
  onSuccess?: (receiptNumber: string) => void;
}

export function RecordPayoutForm({ contributionPlanId, dailyAmount = 0, grossSavings = 0, onSuccess }: RecordPayoutFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof recordPayoutSchema>, unknown, RecordPayoutInput>({
    resolver: zodResolver(recordPayoutSchema),
    defaultValues: {
      contributionPlanId,
      payoutMethod: "CASH",
      payoutDate: new Date(format(new Date(), "yyyy-MM-dd")),
    },
  });

  async function onSubmit(data: RecordPayoutInput) {
    setFormError(null);

    const result = await recordPayoutAction({ ...data, contributionPlanId });

    if (!result.success) {
      setFormError(result.message);
      showToast({ type: "error", message: result.message });
      return;
    }

    showToast({
      type: "success",
      message: `Payout recorded (Receipt ${result.data.receiptNumber}). Account marked as Paid.`,
    });
    router.refresh();
    onSuccess?.(result.data.receiptNumber);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" {...register("contributionPlanId")} />

      {grossSavings > 0 && (
        <div className="grid gap-3 rounded-xl border border-line bg-surface-muted p-4 min-[380px]:grid-cols-3">
          <div>
            <span className="block text-xs text-ink-muted">Gross savings</span>
            <strong className="mt-1 block tabular-nums text-sm text-ink">₦{grossSavings.toLocaleString()}</strong>
          </div>
          <div>
            <span className="block text-xs text-ink-muted">One commission</span>
            <strong className="mt-1 block tabular-nums text-sm text-ink">₦{dailyAmount.toLocaleString()}</strong>
          </div>
          <div>
            <span className="block text-xs text-ink-muted">Customer receives</span>
            <strong className="mt-1 block tabular-nums text-sm text-brand">₦{Math.max(0, grossSavings - dailyAmount).toLocaleString()}</strong>
          </div>
        </div>
      )}

      <Select label="Payout method" error={errors.payoutMethod?.message} {...register("payoutMethod")}>
        <option value="CASH">Cash</option>
        <option value="BANK_TRANSFER">Bank Transfer</option>
      </Select>

      <Input
        label="Payout date"
        type="date"
        error={errors.payoutDate?.message as string | undefined}
        {...register("payoutDate")}
      />

      <Input
        label="Note (optional)"
        placeholder="e.g. Transferred via GTBank — do not enter account numbers"
        error={errors.note?.message}
        {...register("note")}
      />

      <p className="rounded-xl border border-warning/30 bg-warning-soft px-3 py-2.5 text-xs leading-relaxed text-warning">
        This system does not process payments. Only record a payout after the
        cash has been physically handed over or the bank transfer has been
        completed outside this application.
      </p>

      {formError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Complete Payout &amp; Close Period
      </Button>
    </form>
  );
}
