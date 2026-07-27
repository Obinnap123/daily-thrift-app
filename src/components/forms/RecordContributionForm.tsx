"use client";

/**
 * Record today's collection outcome for one customer (Daily Contribution
 * Recording) — Admin or the customer's own Agent. Used inline on the
 * Agent's "Today's Collections" list: one small form per customer row.
 * Defaults the amount field to the plan's own dailyAmount so the common
 * case ("customer paid the usual amount") is a single click.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import { recordContributionSchema, type RecordContributionInput } from "@/validations/contribution";
import { recordContributionAction } from "@/server/actions/contribution.actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";

interface RecordContributionFormProps {
  customerProfileId: string;
  defaultAmount: number;
}

export function RecordContributionForm({
  customerProfileId,
  defaultAmount,
}: RecordContributionFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<
    z.input<typeof recordContributionSchema>,
    unknown,
    RecordContributionInput
  >({
    resolver: zodResolver(recordContributionSchema),
    defaultValues: { customerProfileId, status: "COLLECTED", amount: defaultAmount },
  });

  const status = watch("status");

  async function onSubmit(data: RecordContributionInput) {
    setFormError(null);

    const result = await recordContributionAction({ ...data, customerProfileId });

    if (!result.success) {
      setFormError(result.message);
      showToast({ type: "error", message: result.message });
      return;
    }

    showToast({
      type: "success",
      message: data.status === "COLLECTED" ? "Payment recorded." : "Marked as missed.",
    });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-2">
      <input type="hidden" {...register("customerProfileId")} />

      <select
        aria-label="Collection status"
        {...register("status")}
        className="rounded-lg border border-gray-300 px-2.5 py-2 text-sm text-gray-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        <option value="COLLECTED">Collected</option>
        <option value="MISSED">Missed</option>
      </select>

      {status === "COLLECTED" && (
        <Input
          type="number"
          step="0.01"
          min="0"
          aria-label="Amount collected"
          className="w-28"
          error={errors.amount?.message as string | undefined}
          {...register("amount")}
        />
      )}

      <Button type="submit" size="sm" isLoading={isSubmitting}>
        Save
      </Button>

      {formError && <p className="text-xs text-red-600">{formError}</p>}
    </form>
  );
}
