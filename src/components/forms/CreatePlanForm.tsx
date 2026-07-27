"use client";

/**
 * Start a new savings cycle (ContributionPlan) for a customer — Admin or
 * the customer's own Agent. Shown on the customer detail page whenever the
 * customer has no ACTIVE plan (either brand new, or their previous cycle
 * was already paid out).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import { createContributionPlanSchema, type CreateContributionPlanInput } from "@/validations/contribution";
import { createContributionPlanAction } from "@/server/actions/contribution.actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";
import { format } from "date-fns";

interface CreatePlanFormProps {
  customerProfileId: string;
}

export function CreatePlanForm({ customerProfileId }: CreatePlanFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<
    z.input<typeof createContributionPlanSchema>,
    unknown,
    CreateContributionPlanInput
  >({
    resolver: zodResolver(createContributionPlanSchema),
    defaultValues: {
      customerProfileId,
      durationDays: 31,
      startDate: new Date(format(new Date(), "yyyy-MM-dd")),
    },
  });

  async function onSubmit(data: CreateContributionPlanInput) {
    setFormError(null);

    const result = await createContributionPlanAction({ ...data, customerProfileId });

    if (!result.success) {
      setFormError(result.message);
      showToast({ type: "error", message: result.message });
      return;
    }

    showToast({ type: "success", message: "Savings plan started." });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Input
        label="Daily contribution amount"
        type="number"
        step="0.01"
        min="0"
        placeholder="e.g. 500"
        error={errors.dailyAmount?.message}
        {...register("dailyAmount")}
      />
      <Input
        label="Cycle length (days)"
        type="number"
        min="1"
        error={errors.durationDays?.message}
        {...register("durationDays")}
      />
      <Input
        label="Start date"
        type="date"
        error={errors.startDate?.message as string | undefined}
        {...register("startDate")}
      />

      {formError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Start Savings Plan
      </Button>
    </form>
  );
}
