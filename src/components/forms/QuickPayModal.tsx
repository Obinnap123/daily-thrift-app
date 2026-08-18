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
 *     whether today already has a normal payment recorded) via
 *     getCustomerPlanForQuickPayAction — pre-fills Amount and, for a
 *     duplicate day, shows a warning (Agent) or an override checkbox+
 *     reason field (Admin only).
 *  3. Submit via recordQuickPayAction. On success: toast, show an in-modal
 *     success confirmation (receipt number + a link to the printable
 *     receipt), and refresh dashboard stats via router.refresh() (a Server
 *     Component re-fetch that happens immediately in the background —
 *     deliberately does NOT auto-navigate away from the dashboard, so the
 *     Admin/Agent can immediately see their refreshed stats once they
 *     close the modal).
 */
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
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
  const [alreadyPaidToday, setAlreadyPaidToday] = useState(false);
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);
  const [successReceiptNumber, setSuccessReceiptNumber] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof quickPaySchema>, unknown, QuickPayInput>({
    resolver: zodResolver(quickPaySchema),
    defaultValues: {
      customerProfileId: initialCustomerProfileId ?? "",
      paymentMethod: "CASH",
      paymentDate: format(new Date(), "yyyy-MM-dd"),
      isOverride: false,
    },
  });

  const customerProfileId = watch("customerProfileId");
  const isOverride = watch("isOverride");

  // Reset everything whenever the modal is (re)opened, and pre-select a
  // customer if one was passed in (e.g. from a Customer Tracking page).
  useEffect(() => {
    if (isOpen) {
      reset({
        customerProfileId: initialCustomerProfileId ?? "",
        paymentMethod: "CASH",
        paymentDate: format(new Date(), "yyyy-MM-dd"),
        isOverride: false,
        amount: undefined,
        note: "",
        overrideReason: "",
      });
      setFormError(null);
      setPlanInfo(null);
      setNoActivePlan(false);
      setAlreadyPaidToday(false);
      setSuccessReceiptNumber(null);
      if (initialCustomerProfileId) {
        void loadPlan(initialCustomerProfileId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialCustomerProfileId]);

  async function loadPlan(id: string) {
    setIsLoadingPlan(true);
    setPlanInfo(null);
    setNoActivePlan(false);
    setAlreadyPaidToday(false);

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
    });
    setAlreadyPaidToday(result.data.alreadyPaidToday);
    setValue("amount", result.data.plan.dailyAmount);
  }

  function handleCustomerChange(id: string) {
    setValue("customerProfileId", id, { shouldValidate: true });
    setFormError(null);
    void loadPlan(id);
  }

  async function onSubmit(data: QuickPayInput) {
    setFormError(null);

    let result: Awaited<ReturnType<typeof recordQuickPayAction>>;
    try {
      result = await recordQuickPayAction(data);
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
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
            <p className="text-gray-700">
              Daily contribution plan:{" "}
              <span className="font-medium text-gray-900">
                ₦{planInfo.dailyAmount.toLocaleString()}/day
              </span>{" "}
              · {planInfo.durationDays}-day cycle
            </p>
          </div>
        )}

        {alreadyPaidToday && !isAdmin && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            A payment has already been recorded for this customer today. Only an Admin can
            override this.
          </p>
        )}

        {alreadyPaidToday && isAdmin && (
          <div className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
            <p className="mb-2">
              A payment has already been recorded for this customer today. Check the box below to
              record this as a genuine additional payment (override).
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                {...register("isOverride")}
              />
              <span className="font-medium">Override duplicate-payment check</span>
            </label>
          </div>
        )}

        {isOverride && (
          <Input
            label="Reason for override"
            placeholder="e.g. Customer is catching up a previously missed day"
            error={errors.overrideReason?.message}
            {...register("overrideReason")}
          />
        )}

        <Input
          label="Amount"
          type="number"
          step="0.01"
          min="0"
          error={errors.amount?.message}
          {...register("amount")}
        />

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
          disabled={noActivePlan || (alreadyPaidToday && !isAdmin) || !customerProfileId}
          className="w-full"
        >
          Process Payment
        </Button>
      </form>
    </Modal>
  );
}
