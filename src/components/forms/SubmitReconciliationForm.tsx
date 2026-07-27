"use client";

/**
 * Agent's End-of-Day cash reconciliation submission form.
 * `expectedCash` is display-only (computed server-side from today's
 * Contribution rows) — the agent only enters what they actually counted.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import { submitReconciliationSchema, type SubmitReconciliationInput } from "@/validations/reconciliation";
import { submitReconciliationAction } from "@/server/actions/reconciliation.actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";

interface SubmitReconciliationFormProps {
  expectedCash: number;
}

export function SubmitReconciliationForm({ expectedCash }: SubmitReconciliationFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<
    z.input<typeof submitReconciliationSchema>,
    unknown,
    SubmitReconciliationInput
  >({
    resolver: zodResolver(submitReconciliationSchema),
    defaultValues: { actualCash: expectedCash },
  });

  const actualCash = Number(watch("actualCash") || 0);
  const discrepancy = actualCash - expectedCash;

  async function onSubmit(data: SubmitReconciliationInput) {
    setFormError(null);

    const result = await submitReconciliationAction(data);

    if (!result.success) {
      setFormError(result.message);
      showToast({ type: "error", message: result.message });
      return;
    }

    showToast({ type: "success", message: "Daily collection report submitted." });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
        <span className="text-sm text-gray-500">Expected cash (system-calculated)</span>
        <span className="text-base font-semibold text-gray-900">
          ₦{expectedCash.toLocaleString()}
        </span>
      </div>

      <Input
        label="Actual cash on hand"
        type="number"
        step="0.01"
        min="0"
        error={errors.actualCash?.message as string | undefined}
        {...register("actualCash")}
      />

      {discrepancy !== 0 && !Number.isNaN(discrepancy) && (
        <p
          className={
            discrepancy < 0
              ? "text-sm text-red-600"
              : "text-sm text-amber-600"
          }
        >
          {discrepancy < 0
            ? `Shortfall of ₦${Math.abs(discrepancy).toLocaleString()} vs. expected.`
            : `₦${discrepancy.toLocaleString()} more than expected.`}
        </p>
      )}

      <Input
        label="Notes / discrepancy explanation (optional)"
        placeholder="e.g. Gave change from personal cash"
        error={errors.agentNote?.message as string | undefined}
        {...register("agentNote")}
      />

      {formError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Submit Daily Report
      </Button>
    </form>
  );
}
