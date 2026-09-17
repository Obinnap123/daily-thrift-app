"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";
import { reviewContributionCorrectionAction } from "@/server/actions/contribution-correction.actions";

export function ReviewContributionCorrectionButtons({ correctionRequestId }: { correctionRequestId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  async function review(decision: "APPROVED" | "REJECTED") {
    const reviewNote = decision === "REJECTED" ? window.prompt("Reason for rejecting this correction (required):")?.trim() ?? "" : "";
    if (decision === "REJECTED" && !reviewNote) return;
    setSubmitting(true);
    const result = await reviewContributionCorrectionAction({ correctionRequestId, decision, reviewNote });
    setSubmitting(false);
    if (!result.success) return showToast({ type: "error", message: result.message });
    showToast({ type: "success", message: decision === "APPROVED" ? "One-hour edit window opened." : "Correction rejected." });
    router.refresh();
  }
  return <div className="flex flex-wrap gap-2">
    <Button type="button" size="sm" isLoading={submitting} onClick={() => review("APPROVED")}>Approve for 1 hour</Button>
    <Button type="button" size="sm" variant="danger" isLoading={submitting} onClick={() => review("REJECTED")}>Reject</Button>
  </div>;
}
