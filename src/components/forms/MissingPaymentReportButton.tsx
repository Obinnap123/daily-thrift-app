"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/providers/ToastProvider";
import { submitMissingPaymentReportAction } from "@/server/actions/missing-payment-report.actions";

export function MissingPaymentReportButton({ businessDate }: { businessDate: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    setIsSubmitting(true);
    const paymentDateValue = String(formData.get("paymentDate") ?? "");
    let result: Awaited<ReturnType<typeof submitMissingPaymentReportAction>>;
    try {
      result = await submitMissingPaymentReportAction({
        paymentDate: new Date(`${paymentDateValue}T00:00:00.000Z`),
        reportedAmount: Number(formData.get("reportedAmount")),
        customerNote: String(formData.get("customerNote") ?? ""),
      });
    } catch {
      const message = "Your report could not be sent. Please check your connection and try again.";
      setError(message);
      showToast({ type: "error", message });
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);

    if (!result.success) {
      setError(result.message);
      showToast({ type: "error", message: result.message });
      return;
    }

    showToast({ type: "success", message: "Your payment report has been sent to the admin." });
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Report a Missing Payment
      </Button>
      <Modal
        isOpen={open}
        onClose={() => !isSubmitting && setOpen(false)}
        title="Report a Missing Payment"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm leading-relaxed text-ink-muted">
            Use this only when you handed money to an agent but the payment is not showing in
            your savings. Submitting a report does not add money automatically; an admin will
            investigate it first.
          </p>
          <Input
            name="paymentDate"
            type="date"
            label="Date you made the payment"
            max={businessDate}
            defaultValue={businessDate}
            required
          />
          <Input
            name="reportedAmount"
            type="number"
            min="1"
            step="0.01"
            label="Amount paid"
            placeholder="e.g. 3000"
            required
          />
          <div className="space-y-1.5">
            <label htmlFor="customerNote" className="text-sm font-medium text-ink">
              Extra details (optional)
            </label>
            <textarea
              id="customerNote"
              name="customerNote"
              rows={3}
              maxLength={500}
              placeholder="e.g. Cash paid to my agent around 3pm"
              className="min-h-24 w-full resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-base text-ink shadow-sm placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 sm:text-sm"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting}>
              Send Report
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
