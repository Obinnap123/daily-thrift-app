"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";
import { applyContributionCorrectionSchema, type ApplyContributionCorrectionInput } from "@/validations/contribution-correction";
import { applyContributionCorrectionAction } from "@/server/actions/contribution-correction.actions";

interface Props {
  correctionRequestId: string;
  originalAmount: number;
  originalPaymentMethod: "CASH" | "BANK_TRANSFER";
  originalNote: string | null;
}

export function ApplyContributionCorrectionForm({ correctionRequestId, originalAmount, originalPaymentMethod, originalNote }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.input<typeof applyContributionCorrectionSchema>, unknown, ApplyContributionCorrectionInput>({
    resolver: zodResolver(applyContributionCorrectionSchema),
    defaultValues: {
      correctionRequestId,
      correctedAmount: originalAmount,
      correctedPaymentMethod: originalPaymentMethod,
      correctedNote: originalNote ?? "",
    },
  });

  async function submit(input: ApplyContributionCorrectionInput) {
    setFormError(null);
    const result = await applyContributionCorrectionAction(input);
    if (!result.success) {
      setFormError(result.message);
      return showToast({ type: "error", message: result.message });
    }
    showToast({ type: "success", message: "Payment corrected. Tracking, balances, reports, and reconciliation were recalculated." });
    router.refresh();
  }

  return <form onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-2">
    <input type="hidden" {...register("correctionRequestId")} />
    <Input label="Correct amount" type="number" min="0" step="0.01" error={errors.correctedAmount?.message} {...register("correctedAmount")} />
    <Select label="Payment method" error={errors.correctedPaymentMethod?.message} {...register("correctedPaymentMethod")}>
      <option value="CASH">Cash</option>
      <option value="BANK_TRANSFER">Bank Transfer</option>
    </Select>
    <div className="sm:col-span-2"><Input label="Correct note (optional)" error={errors.correctedNote?.message} {...register("correctedNote")} /></div>
    {formError && <p role="alert" className="text-sm text-danger sm:col-span-2">{formError}</p>}
    <div className="sm:col-span-2"><Button type="submit" isLoading={isSubmitting}>Save corrected payment</Button></div>
  </form>;
}
