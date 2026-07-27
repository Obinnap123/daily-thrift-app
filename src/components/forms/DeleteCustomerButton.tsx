"use client";

/**
 * Delete Customer Registration button — Admin only.
 * ----------------------------------------------------------------------------
 * Deliberately requires typing the customer's name to confirm (not just a
 * plain window.confirm) since this is destructive and irreversible — a
 * higher-friction confirmation than ToggleAgentActiveButton's confirm()
 * dialog is warranted here because there is no "reactivate" undo path.
 *
 * `canDelete` is passed down from the server (computed via
 * countCustomerFinancialActivity) so the button can show WHY deletion is
 * blocked before the user even opens the confirmation — the real
 * enforcement still happens server-side in deleteCustomer(), this is only
 * a UX nicety to avoid a wasted round-trip.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteCustomerAction } from "@/server/actions/customer.actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/providers/ToastProvider";

interface DeleteCustomerButtonProps {
  customerProfileId: string;
  customerName: string;
  /** Whether this customer has zero recorded Contribution/Payout rows. */
  canDelete: boolean;
  /** Where to navigate after a successful delete (e.g. back to the list). */
  redirectTo: string;
}

export function DeleteCustomerButton({
  customerProfileId,
  customerName,
  canDelete,
  redirectTo,
}: DeleteCustomerButtonProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleDelete() {
    if (confirmText.trim() !== customerName) {
      setFormError(`Type "${customerName}" exactly to confirm.`);
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    const result = await deleteCustomerAction({ customerProfileId });
    setIsSubmitting(false);

    if (!result.success) {
      setFormError(result.message);
      showToast({ type: "error", message: result.message });
      return;
    }

    showToast({ type: "success", message: "Customer registration deleted." });
    setIsOpen(false);
    router.push(redirectTo);
    router.refresh();
  }

  if (!canDelete) {
    return (
      <div className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-500">
        This customer has recorded payments or payouts, so their registration cannot be
        deleted — this preserves the financial audit trail.
      </div>
    );
  }

  return (
    <>
      <Button type="button" variant="danger" onClick={() => setIsOpen(true)}>
        Delete Registration
      </Button>

      <Modal
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          setConfirmText("");
          setFormError(null);
        }}
        title="Delete Customer Registration"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            This permanently deletes <span className="font-medium text-gray-900">{customerName}</span>
            &apos;s login account and profile. This action cannot be undone.
          </p>
          <Input
            label={`Type "${customerName}" to confirm`}
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            error={formError ?? undefined}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => {
                setIsOpen(false);
                setConfirmText("");
                setFormError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              className="w-full"
              isLoading={isSubmitting}
              onClick={handleDelete}
            >
              Delete Permanently
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
