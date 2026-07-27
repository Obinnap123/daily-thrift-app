"use client";

/**
 * Admin's Approve / Reject controls for one submitted reconciliation report.
 * Reject requires a note (prompted via window.prompt) so there's always a
 * documented reason in reviewNote — approve does not require one.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { reviewReconciliationAction } from "@/server/actions/reconciliation.actions";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";

export function ReviewReconciliationButtons({ reconciliationId }: { reconciliationId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleReview(decision: "APPROVED" | "REJECTED") {
    let reviewNote = "";
    if (decision === "REJECTED") {
      const entered = window.prompt("Reason for rejecting this report (required):");
      if (!entered || !entered.trim()) return;
      reviewNote = entered.trim();
    }

    setIsSubmitting(true);
    const result = await reviewReconciliationAction({ reconciliationId, decision, reviewNote });
    setIsSubmitting(false);

    if (!result.success) {
      showToast({ type: "error", message: result.message });
      return;
    }

    showToast({
      type: "success",
      message: decision === "APPROVED" ? "Report approved." : "Report rejected.",
    });
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        size="sm"
        isLoading={isSubmitting}
        onClick={() => handleReview("APPROVED")}
      >
        Approve
      </Button>
      <Button
        type="button"
        size="sm"
        variant="danger"
        isLoading={isSubmitting}
        onClick={() => handleReview("REJECTED")}
      >
        Reject
      </Button>
    </div>
  );
}
