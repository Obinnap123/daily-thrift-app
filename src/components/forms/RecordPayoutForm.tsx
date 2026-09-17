"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { z } from "zod";
import { recordPayoutSchema, type RecordPayoutInput } from "@/validations/payout";
import { recordPayoutAction } from "@/server/actions/payout.actions";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";
import { calculatePayout, type PayoutMonthOption } from "@/lib/payout-selection";
import { dateKey, today } from "@/lib/date";

interface Props {
  contributionPlanId: string;
  months: PayoutMonthOption[];
  commissionDays?: number;
  onSuccess?: (receiptNumber: string) => void;
}

const money = (amount: number) => `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export function RecordPayoutForm({ contributionPlanId, months, commissionDays = 1, onSuccess }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const canFullPayout = months.every((month) => month.grossSavings > (month.commissionCharged ? 0 : month.dailyAmount * commissionDays));
  const { register, handleSubmit, control, setValue, formState: { errors, isSubmitting } } = useForm<z.input<typeof recordPayoutSchema>, unknown, RecordPayoutInput>({
    resolver: zodResolver(recordPayoutSchema),
    defaultValues: {
      contributionPlanId,
      clientRequestId: "",
      mode: canFullPayout ? "FULL" : "PARTIAL",
      requestedMonths: [],
      payoutMethod: "CASH",
      payoutDate: dateKey(today()),
    },
  });
  useEffect(() => {
    setValue("clientRequestId", crypto.randomUUID());
  }, [setValue]);
  const mode = useWatch({ control, name: "mode" }) ?? "FULL";
  const requestedMonths = useWatch({ control, name: "requestedMonths" }) ?? [];
  const validRequests = requestedMonths.map((row) => ({ month: row.month, customerAmount: Number(row.customerAmount) || 0 }));
  const summary = calculatePayout({ months, mode, requestedMonths: validRequests, commissionDays });
  const hasCompleteAmounts = mode === "FULL" || (requestedMonths.length > 0 && validRequests.every((row) => {
    const month = months.find((item) => item.key === row.month);
    return !!month && row.customerAmount > 0 && row.customerAmount <= month.grossSavings - (month.commissionCharged ? 0 : month.dailyAmount * commissionDays);
  }));

  function chooseMode(next: "FULL" | "PARTIAL") {
    setValue("mode", next, { shouldValidate: true });
    setValue("requestedMonths", [], { shouldValidate: true });
    setFormError(null);
  }

  function toggleMonth(month: PayoutMonthOption) {
    const next = requestedMonths.some((row) => row.month === month.key)
      ? requestedMonths.filter((row) => row.month !== month.key)
      : [...requestedMonths, { month: month.key, customerAmount: undefined as unknown as number }];
    setValue("requestedMonths", next, { shouldValidate: false });
  }

  async function onSubmit(data: RecordPayoutInput) {
    setFormError(null);
    const preview = calculatePayout({ months, mode: data.mode, requestedMonths: data.requestedMonths, commissionDays });
    if (preview.breakdown.length === 0 || preview.breakdown.some((month) => month.customerAmount > month.maxCustomerAmount || month.customerAmount <= 0)) {
      setFormError("Check the amount for each month. It must be greater than zero and no more than the maximum shown.");
      return;
    }
    const result = await recordPayoutAction({ ...data, contributionPlanId });
    if (!result.success) {
      setFormError(result.message);
      showToast({ type: "error", message: result.message });
      return;
    }
    showToast({ type: "success", message: result.data.remainingBalance > 0
      ? `Partial payout recorded. ${money(result.data.remainingBalance)} remains saved.`
      : `Payout recorded (Receipt ${result.data.receiptNumber}).` });
    router.refresh();
    onSuccess?.(result.data.receiptNumber);
  }

  const availableTotal = months.reduce((sum, month) => sum + month.grossSavings, 0);
  const selectedMonthKeys = new Set(summary.breakdown.map((month) => month.key));
  const untouchedMonths = months.filter((month) => !selectedMonthKeys.has(month.key));
  const untouchedBalance = untouchedMonths.reduce((sum, month) => sum + month.grossSavings, 0);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex min-w-0 flex-col gap-5" noValidate>
      <input type="hidden" {...register("contributionPlanId")} />
      <input type="hidden" {...register("clientRequestId")} />
      <input type="hidden" {...register("mode")} />

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-ink">What does the customer want to collect?</legend>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Payout type">
          {(["FULL", "PARTIAL"] as const).map((choice) => (
            <button key={choice} type="button" onClick={() => chooseMode(choice)} aria-pressed={mode === choice} disabled={choice === "FULL" && !canFullPayout}
              className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${mode === choice ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-ink hover:bg-surface-hover"}`}>
              {choice === "FULL" ? "Full payout" : "Partial payout"}
            </button>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">{mode === "FULL"
          ? "Pay all remaining savings and close this savings period. Each unpaid month has its own commission."
          : "Choose one or more months, then enter the exact amount the customer receives from each month. The rest stays saved."}</p>
        {!canFullPayout && <p className="text-xs text-warning">Full payout is unavailable until every unpaid month has enough savings to cover its commission.</p>}
      </fieldset>

      {mode === "PARTIAL" ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-ink">Choose months</legend>
          {months.map((month) => {
            const index = requestedMonths.findIndex((row) => row.month === month.key);
            const checked = index >= 0;
            const commission = month.commissionCharged ? 0 : month.dailyAmount * commissionDays;
            const max = Math.round((month.grossSavings - commission) * 100) / 100;
            const enteredAmount = Number(requestedMonths[index]?.customerAmount);
            const amountError = checked && enteredAmount > max ? `Maximum customer amount for this month is ${money(max)}.` : errors.requestedMonths?.[index]?.customerAmount?.message;
            return (
              <div key={month.key} className={`min-w-0 rounded-xl border p-3 ${checked ? "border-brand bg-brand-soft" : "border-line bg-surface"}`}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={checked} disabled={max <= 0} onChange={() => toggleMonth(month)} className="size-5 shrink-0 accent-emerald-600" />
                  <span className="min-w-0 flex-1 text-sm font-semibold text-ink">{format(month.monthStart, "MMMM yyyy")}</span>
                  <span className="text-sm font-semibold tabular-nums text-ink">{money(month.grossSavings)} saved</span>
                </label>
                <p className="ml-8 text-xs text-ink-muted">{month.fundedSlots} funded days · {commission ? `${money(commission)} commission for this month` : "Commission already collected"}</p>
                {checked && (
                  <div className="ml-8 mt-3 min-w-0 space-y-2 border-t border-line pt-3">
                    <Input type="number" min="0.01" step="0.01" max={max} inputMode="decimal"
                      label={`Customer receives from ${format(month.monthStart, "MMMM yyyy")}`}
                      placeholder={`Up to ${money(max)}`}
                      error={amountError}
                      {...register(`requestedMonths.${index}.customerAmount`)} />
                    <input type="hidden" {...register(`requestedMonths.${index}.month`)} />
                    <button type="button" className="min-h-10 text-sm font-medium text-brand underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                      onClick={() => setValue(`requestedMonths.${index}.customerAmount`, max, { shouldValidate: true })}>Pay all available from this month ({money(max)})</button>
                    <p className="text-xs text-ink-muted">Maximum after this month&apos;s commission: {money(max)}</p>
                  </div>
                )}
              </div>
            );
          })}
          {requestedMonths.length === 0 && <p className="text-sm text-ink-muted">Select at least one month to continue.</p>}
        </fieldset>
      ) : (
        <div className="rounded-xl border border-line bg-surface-muted p-3 text-sm text-ink-muted">
          All {months.length} unpaid month{months.length === 1 ? "" : "s"} · {money(availableTotal)} total saved
        </div>
      )}

      {mode === "PARTIAL" && requestedMonths.length > 0 && !hasCompleteAmounts && (
        <p className="rounded-xl border border-line bg-surface-muted p-3 text-sm text-ink-muted">Enter a valid amount for each selected month to see the payout summary.</p>
      )}
      {hasCompleteAmounts && (
        <div className="rounded-xl border border-line bg-surface-muted p-4" aria-live="polite">
          <h3 className="text-sm font-semibold text-ink">Review this payout</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3 text-ink-muted"><dt>Savings used</dt><dd className="tabular-nums">{money(summary.grossSavings)}</dd></div>
            <div className="flex justify-between gap-3 text-ink-muted"><dt>Commission ({summary.breakdown.length} month{summary.breakdown.length === 1 ? "" : "s"})</dt><dd className="tabular-nums">{money(summary.commissionAmount)}</dd></div>
            <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold text-ink"><dt>Customer receives</dt><dd className="tabular-nums">{money(summary.customerAmount)}</dd></div>
            {mode === "PARTIAL" && summary.breakdown.map((month) => (
              <div key={month.key} className="flex justify-between gap-3 text-ink-muted">
                <dt>{format(month.monthStart, "MMMM yyyy")} still saved</dt>
                <dd className="shrink-0 tabular-nums">{money(month.remainingBalance)}</dd>
              </div>
            ))}
            {mode === "PARTIAL" && untouchedMonths.length > 0 && (
              <div className="flex justify-between gap-3 text-ink-muted">
                <dt>{untouchedMonths.length === 1 ? format(untouchedMonths[0].monthStart, "MMMM yyyy") : `${untouchedMonths.length} other months`} (not included)</dt>
                <dd className="shrink-0 tabular-nums">{money(untouchedBalance)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold text-ink"><dt>Total still saved across all months</dt><dd className="shrink-0 tabular-nums">{money(summary.remainingBalance)}</dd></div>
          </dl>
          {summary.breakdown.length > 1 && <p className="mt-2 text-xs text-ink-muted">Each month&apos;s commission is calculated separately. Previously collected commission is not charged again.</p>}
        </div>
      )}

      <Select label="Payout method" error={errors.payoutMethod?.message} {...register("payoutMethod")}>
        <option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank Transfer</option>
      </Select>
      <Input label="Payout date" type="date" error={errors.payoutDate?.message as string | undefined} {...register("payoutDate")} />
      <Input label="Note (optional)" placeholder="e.g. Transferred via GTBank — do not enter account numbers" error={errors.note?.message} {...register("note")} />
      <p className="rounded-xl border border-warning/30 bg-warning-soft px-3 py-2.5 text-xs leading-relaxed text-warning">
        This system does not send money. Confirm the cash was handed over or the bank transfer completed before recording this payout.
      </p>
      {formError && <p role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger">{formError}</p>}
      <Button type="submit" isLoading={isSubmitting} className="w-full">
        {mode === "FULL" ? "Record full payout & close period" : "Record partial payout"}
      </Button>
    </form>
  );
}
