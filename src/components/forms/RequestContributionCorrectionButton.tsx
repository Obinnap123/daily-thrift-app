"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/providers/ToastProvider";
import { requestContributionCorrectionAction } from "@/server/actions/contribution-correction.actions";

export function RequestContributionCorrectionButton({ contributionId }: { contributionId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    const result = await requestContributionCorrectionAction({ contributionId, requestReason: reason });
    setSubmitting(false);
    if (!result.success) return showToast({ type: "error", message: result.message });
    showToast({ type: "success", message: "Correction request sent to the Admin." });
    setOpen(false);
    setReason("");
    router.refresh();
  }

  return <>
    <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>Request edit</Button>
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Request payment correction" panelClassName="sm:max-w-lg">
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">Explain the mistake. An Admin must approve it before a one-hour edit window opens.</p>
        <label className="block text-sm font-medium text-ink">
          Reason
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={4} className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/25" placeholder="e.g. I entered ₦10,000 instead of ₦1,000" />
        </label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" isLoading={submitting} disabled={reason.trim().length < 5} onClick={submit}>Send request</Button>
        </div>
      </div>
    </Modal>
  </>;
}
