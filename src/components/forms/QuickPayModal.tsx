"use client";

/**
 * "Quick Pay" modal — the centralized way to record a customer's daily
 * contribution payment from either dashboard (Admin/Agent), or from a
 * Customer Tracking page. Opened by <QuickPayButton>.
 * ----------------------------------------------------------------------------
 * Flow:
 *  1. Pick a customer (search-select, scoped to `customers` prop — an
 *     Agent only ever receives their own customers from the caller).
 *  2. On selection, fetch that customer's active plan (daily amount, and
 *     today's payment count) via getCustomerPlanForQuickPayAction. Another
 *     payment on the same day asks either role for explicit confirmation.
 *  3. Submit via recordQuickPayAction. On success: toast, show an in-modal
 *     success confirmation (receipt number + a link to the printable
 *     receipt), and refresh dashboard stats via router.refresh() (a Server
 *     Component re-fetch that happens immediately in the background —
 *     deliberately does NOT auto-navigate away from the dashboard, so the
 *     Admin/Agent can immediately see their refreshed stats once they
 *     close the modal).
 */
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import type { z } from "zod";
import { quickPaySchema, type QuickPayInput } from "@/validations/contribution";
import {
  recordQuickPayAction,
  getCustomerPlanForQuickPayAction,
  searchQuickPayCustomersAction,
} from "@/server/actions/contribution.actions";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { CustomerSearchSelect, type CustomerSearchOption } from "@/components/forms/CustomerSearchSelect";
import { useToast } from "@/components/providers/ToastProvider";
import { format } from "date-fns";
import { previewRequiredMonthlyRates } from "@/lib/monthly-rate-preview";

interface QuickPayModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: CustomerSearchOption[];
  isAdmin: boolean;
  /** Pre-select a customer (e.g. opened from that customer's Tracking page). */
  initialCustomerProfileId?: string;
  /** Called with the new receipt number right after a successful payment. */
  onSuccess?: (receiptNumber: string) => void;
}

interface PlanInfo {
  dailyAmount: number;
  durationDays: number;
  startsNewPeriod: boolean;
  nextCoverageDate: string;
  creditBalance: number;
  monthlyRates: { month: string; dailyAmount: number; locked: boolean }[];
}

export function QuickPayModal({
  isOpen,
  onClose,
  customers,
  isAdmin,
  initialCustomerProfileId,
  onSuccess,
}: QuickPayModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [noActivePlan, setNoActivePlan] = useState(false);
  const [paymentsToday, setPaymentsToday] = useState(0);
  const [requiresAdditionalConfirmation, setRequiresAdditionalConfirmation] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);
  const [successReceiptNumber, setSuccessReceiptNumber] = useState<string | null>(null);
  const [additionalRateChoices, setAdditionalRateChoices] = useState<Record<string, number | "">>({});
  const [monthlyRateErrors, setMonthlyRateErrors] = useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof quickPaySchema>, unknown, QuickPayInput>({
    resolver: zodResolver(quickPaySchema),
    defaultValues: {
      customerProfileId: initialCustomerProfileId ?? "",
      paymentMethod: "CASH",
      paymentDate: format(new Date(), "yyyy-MM-dd"),
      confirmAdditionalPayment: false,
      clientRequestId: requestId,
    },
  });

  const customerProfileId = useWatch({ control, name: "customerProfileId" });
  const selectedPaymentDate = useWatch({ control, name: "paymentDate" });
  const isTodayPaymentDate = !isAdmin || selectedPaymentDate === format(new Date(), "yyyy-MM-dd");
  const enteredAmount = Number(useWatch({ control, name: "amount" }) ?? 0);
  const enteredCurrentRate = Number(useWatch({ control, name: "monthlyDailyAmount" }) ?? 0);

  // The parent mounts a fresh modal for every opening. Only the optional
  // pre-selected customer's plan needs to be loaded after mount.
  async function loadPlan(id: string) {
    setIsLoadingPlan(true);
    setPlanInfo(null);
    setNoActivePlan(false);
    setPaymentsToday(0);
    setRequiresAdditionalConfirmation(false);
    setValue("confirmAdditionalPayment", false);
    setAdditionalRateChoices({});
    setMonthlyRateErrors({});

    const result = await getCustomerPlanForQuickPayAction(id);
    setIsLoadingPlan(false);

    if (!result.success) {
      setFormError(result.message);
      return;
    }
    if (!result.data.plan) {
      setNoActivePlan(true);
      return;
    }
    setPlanInfo({
      dailyAmount: result.data.plan.dailyAmount,
      durationDays: result.data.plan.durationDays,
      startsNewPeriod: result.data.startsNewPeriod,
      nextCoverageDate: result.data.plan.nextCoverageDate,
      creditBalance: result.data.plan.creditBalance,
      monthlyRates: result.data.plan.monthlyRates,
    });
    setPaymentsToday(result.data.paymentsToday);
    setValue("amount", result.data.plan.dailyAmount);
    setValue("monthlyDailyAmount", result.data.plan.dailyAmount);
  }

  useEffect(() => {
    if (initialCustomerProfileId) {
      void Promise.resolve().then(() => loadPlan(initialCustomerProfileId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCustomerProfileId]);

  function handleCustomerChange(id: string) {
    setValue("customerProfileId", id, { shouldValidate: true });
    setFormError(null);
    void loadPlan(id);
  }

  async function onSubmit(data: QuickPayInput) {
    setFormError(null);

    const submittedMonthlyRates = requiredAdditionalRates.map((rate) => ({
      month: rate.month,
      dailyAmount: additionalRateChoices[rate.month] ?? rate.dailyAmount,
    }));
    const invalidMonthlyRates = submittedMonthlyRates.filter(
      (rate) =>
        rate.dailyAmount === "" ||
        !Number.isFinite(rate.dailyAmount) ||
        Number(rate.dailyAmount) <= 0,
    );
    if (invalidMonthlyRates.length > 0) {
      setMonthlyRateErrors(
        Object.fromEntries(
          invalidMonthlyRates.map((rate) => [rate.month, "Enter a daily rate greater than zero"]),
        ),
      );
      const message = "Enter a valid daily rate for every month shown below.";
      setFormError(message);
      showToast({ type: "error", message });
      return;
    }

    let result: Awaited<ReturnType<typeof recordQuickPayAction>>;
    try {
      result = await recordQuickPayAction({
        ...data,
        monthlyRates: submittedMonthlyRates.map((rate) => ({
          month: rate.month,
          dailyAmount: Number(rate.dailyAmount),
        })),
      });
    } catch {
      const message =
        "Payment could not be recorded. No money was added. Please check your connection and try again.";
      setFormError(message);
      showToast({ type: "error", message });
      return;
    }

    if (!result.success) {
      setFormError(result.message);
      showToast({ type: "error", message: result.message });
      if (result.message.includes("already recorded")) {
        setRequiresAdditionalConfirmation(true);
      }
      return;
    }

    showToast({
      type: "success",
      message: `Payment recorded. Receipt ${result.data.receiptNumber}.`,
    });
    onSuccess?.(result.data.receiptNumber);
    setSuccessReceiptNumber(result.data.receiptNumber);
    // Refresh every Server-Component dashboard stat in the background
    // right away — by the time the user closes this success screen, the
    // numbers behind the modal are already up to date.
    router.refresh();
  }

  const receiptBasePath = isAdmin ? "/admin/contributions" : "/agent/contributions";
  const currentMonth = planInfo?.nextCoverageDate.slice(0, 7) ?? "";
  const currentMonthRate = planInfo?.monthlyRates.find((rate) => rate.month === currentMonth);
  const requiredAdditionalRates = (() => {
    if (!planInfo || enteredAmount <= 0 || enteredCurrentRate <= 0) return [];
    const choices = [
      { month: currentMonth, dailyAmount: enteredCurrentRate },
      ...Object.entries(additionalRateChoices)
        .filter((choice): choice is [string, number] =>
          typeof choice[1] === "number" && Number.isFinite(choice[1]) && choice[1] > 0,
        )
        .map(([month, dailyAmount]) => ({ month, dailyAmount })),
    ];
    return previewRequiredMonthlyRates({
      nextCoverageDate: new Date(planInfo.nextCoverageDate),
      availableAmount: planInfo.creditBalance + enteredAmount,
      fallbackDailyAmount: enteredCurrentRate,
      knownRates: planInfo.monthlyRates,
      choices,
    }).filter((rate) => rate.month !== currentMonth);
  })();

  if (successReceiptNumber) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Quick Pay — Payment Recorded">
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-7 w-7">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">Payment recorded successfully</p>
            <p className="mt-1 text-sm text-gray-500">
              Receipt <span className="font-mono font-medium text-gray-900">{successReceiptNumber}</span>
              . The customer&apos;s savings balance, digital passbook, and collection summary have
              all been updated.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => router.push(`${receiptBasePath}/${successReceiptNumber}`)}
            >
              View / Print Receipt
            </Button>
            <Button type="button" className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Quick Pay — Record a Payment">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <CustomerSearchSelect
          options={customers}
          onSearch={searchQuickPayCustomersAction}
          value={customerProfileId || null}
          onChange={handleCustomerChange}
          error={errors.customerProfileId?.message}
        />
        <input type="hidden" {...register("customerProfileId")} />

        {isLoadingPlan && <p className="text-sm text-gray-500">Loading plan…</p>}

        {noActivePlan && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This customer has no active savings plan. Start a plan for them first (from their
            profile page) before recording a payment.
          </p>
        )}

        {planInfo && (
          <div className="rounded-lg border border-line bg-surface-muted p-3 text-sm">
            <p className="text-gray-700">
              Daily contribution plan:{" "}
              <span className="font-medium text-gray-900">
                ₦{planInfo.dailyAmount.toLocaleString()}/day
              </span>{" "}
              · {planInfo.durationDays}-day cycle
            </p>
            {planInfo.startsNewPeriod && (
              <p className="mt-2 rounded-md bg-brand-soft px-3 py-2 text-brand-ink">
                This payment will automatically open the customer&apos;s next savings period.
              </p>
            )}
            <p className="mt-2 text-xs text-ink-muted">
              Payments are allocated using the saved daily rate for each calendar month.
            </p>
          </div>
        )}

        {planInfo && (
          <Input
            label={`Daily rate for ${format(new Date(`${currentMonth}-01T00:00:00.000Z`), "MMMM yyyy")}`}
            type="number"
            step="0.01"
            min="0"
            disabled={currentMonthRate?.locked}
            className={currentMonthRate?.locked ? "cursor-not-allowed bg-surface-muted text-ink-muted" : undefined}
            error={errors.monthlyDailyAmount?.message}
            {...register("monthlyDailyAmount")}
          />
        )}
        {currentMonthRate?.locked && (
          <p className="-mt-2 text-xs text-ink-muted">This month already has funded days, so its agreed rate is locked.</p>
        )}
        {requiredAdditionalRates.length > 0 && (
          <fieldset className="space-y-3 rounded-xl border border-line bg-surface-muted p-3">
            <legend className="px-1 text-sm font-semibold text-ink">Confirm rates for the next month(s)</legend>
            <p className="text-xs text-ink-muted">
              This payment reaches another calendar month. Enter that month&apos;s agreed daily contribution rate. You can keep the suggested rate or replace it.
            </p>
            {requiredAdditionalRates.map((rate) => (
              <Input
                key={rate.month}
                label={`Daily rate for ${format(new Date(`${rate.month}-01T00:00:00.000Z`), "MMMM yyyy")}`}
                type="number"
                step="0.01"
                min="0"
                value={additionalRateChoices[rate.month] ?? rate.dailyAmount}
                error={monthlyRateErrors[rate.month]}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setAdditionalRateChoices((current) => ({
                    ...current,
                    [rate.month]: nextValue === "" ? "" : Number(nextValue),
                  }));
                  setMonthlyRateErrors((current) => {
                    if (!current[rate.month]) return current;
                    const next = { ...current };
                    delete next[rate.month];
                    return next;
                  });
                  setFormError(null);
                }}
              />
            ))}
          </fieldset>
        )}

        {((isTodayPaymentDate && paymentsToday > 0) || requiresAdditionalConfirmation) && (
          <div className="rounded-xl border border-warning/30 bg-warning-soft px-3 py-3 text-sm text-ink">
            <p className="mb-2 font-medium">
              {isTodayPaymentDate && paymentsToday > 0
                ? `${paymentsToday} ${paymentsToday === 1 ? "payment has" : "payments have"} already been recorded for this customer today.`
                : "A payment has already been recorded for this customer on the selected date."}
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-line-strong text-brand focus:ring-brand"
                {...register("confirmAdditionalPayment")}
              />
              <span>Yes, this is another payment received from the customer.</span>
            </label>
          </div>
        )}

        <Input
          label="Payment amount collected"
          type="number"
          step="0.01"
          min="0"
          error={errors.amount?.message}
          {...register("amount")}
        />
        {planInfo && enteredAmount > 0 && enteredCurrentRate > 0 && (
          <p className="-mt-2 text-xs text-ink-muted">
            {enteredAmount < enteredCurrentRate
              ? `₦${enteredAmount.toLocaleString()} will remain as credit toward the next funded day.`
              : enteredAmount === enteredCurrentRate
                ? `₦${enteredAmount.toLocaleString()} funds one day at ₦${enteredCurrentRate.toLocaleString()}/day.`
                : "The payment will fund the oldest unpaid days first; any amount below the next full daily rate remains as credit."}
          </p>
        )}

        <Select label="Payment method" error={errors.paymentMethod?.message} {...register("paymentMethod")}>
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank Transfer</option>
        </Select>

        <Input
          label="Payment date"
          type="date"
          disabled={!isAdmin}
          className={!isAdmin ? "cursor-not-allowed bg-gray-100 text-gray-500" : undefined}
          error={errors.paymentDate?.message as string | undefined}
          {...register("paymentDate")}
        />
        {!isAdmin && (
          <p className="-mt-2 text-xs text-gray-500">
            Agents can only record payments for today. Only an Admin can backdate a payment date.
          </p>
        )}

        <Input
          label="Notes (optional)"
          placeholder="e.g. Partial cash on hand at visit"
          error={errors.note?.message}
          {...register("note")}
        />

        {formError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}

        {/* Button's "primary" variant is already emerald/green, matching the
            spec's "green Process Payment button" — no color override needed. */}
        <Button
          type="submit"
          isLoading={isSubmitting}
          disabled={noActivePlan || !customerProfileId}
          className="w-full"
        >
          Process Payment
        </Button>
      </form>
    </Modal>
  );
}
