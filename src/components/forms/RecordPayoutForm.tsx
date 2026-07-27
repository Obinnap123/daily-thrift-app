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
  onSuccess?: (receiptNumber: string) => void;
}

export function RecordPayoutForm({ contributionPlanId, onSuccess }: RecordPayoutFormProps) {
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

      <p className="text-xs text-gray-500">
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
        Record Payout &amp; Mark as Paid
      </Button>
    </form>
  );
}
