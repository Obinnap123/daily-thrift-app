"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/providers/ToastProvider";
import { reviewMissingPaymentReportAction } from "@/server/actions/missing-payment-report.actions";

export function ReviewMissingPaymentReportButton({ reportId }: { reportId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [decision, setDecision] = useState<"RESOLVED" | "DISMISSED" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!decision) return;
    setError(null);
    const formData = new FormData(event.currentTarget);
    setIsSubmitting(true);
    let result: Awaited<ReturnType<typeof reviewMissingPaymentReportAction>>;
    try {
      result = await reviewMissingPaymentReportAction({
        reportId,
        decision,
        reviewNote: String(formData.get("reviewNote") ?? ""),
      });
    } catch {
      const message = "This report could not be updated. Please check your connection and try again.";
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

    showToast({
      type: "success",
      message: decision === "RESOLVED" ? "Payment report resolved." : "Payment report dismissed.",
    });
    setDecision(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => setDecision("RESOLVED")}>
          Resolve
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setDecision("DISMISSED")}>
          Dismiss
        </Button>
      </div>
      <Modal
        isOpen={decision !== null}
        onClose={() => !isSubmitting && setDecision(null)}
        title={decision === "RESOLVED" ? "Resolve Payment Report" : "Dismiss Payment Report"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm leading-relaxed text-ink-muted">
            Record what you verified. This closes the report only—it does not create or edit a
            financial transaction.
          </p>
          <div className="space-y-1.5">
            <label htmlFor={`reviewNote-${reportId}`} className="text-sm font-medium text-ink">
              Review note
            </label>
            <textarea
              id={`reviewNote-${reportId}`}
              name="reviewNote"
              rows={4}
              minLength={3}
              maxLength={500}
              required
              placeholder="e.g. Verified receipt and recorded payment through Quick Pay"
              className="min-h-28 w-full resize-y rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-base text-ink shadow-sm placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 sm:text-sm"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" disabled={isSubmitting} onClick={() => setDecision(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={decision === "DISMISSED" ? "danger" : "primary"}
              isLoading={isSubmitting}
            >
              {decision === "RESOLVED" ? "Confirm Resolution" : "Confirm Dismissal"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
