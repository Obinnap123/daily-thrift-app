"use client";

/**
 * Activate / Deactivate Agent button — Admin only.
 * ----------------------------------------------------------------------------
 * Shows a confirmation prompt before deactivating an agent who currently
 * has assigned customers, since those customers will remain assigned to
 * a now-inactive agent until an Admin manually reassigns them (see
 * setAgentActive() service comment for why this is not automatic).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAgentActiveAction } from "@/server/actions/agent.actions";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";

interface ToggleAgentActiveButtonProps {
  agentId: string;
  isActive: boolean;
  managedCustomerCount: number;
}

export function ToggleAgentActiveButton({
  agentId,
  isActive,
  managedCustomerCount,
}: ToggleAgentActiveButtonProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleToggle() {
    if (isActive && managedCustomerCount > 0) {
      const confirmed = window.confirm(
        `This agent still has ${managedCustomerCount} customer(s) assigned to them. ` +
          "They will remain assigned to this agent even after deactivation, until you " +
          "reassign them individually. Continue deactivating?"
      );
      if (!confirmed) return;
    }

    setIsSubmitting(true);
    const result = await setAgentActiveAction({ id: agentId, isActive: !isActive });
    setIsSubmitting(false);

    if (!result.success) {
      showToast({ type: "error", message: result.message });
      return;
    }

    showToast({
      type: "success",
      message: isActive ? "Agent deactivated." : "Agent activated.",
    });
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant={isActive ? "danger" : "primary"}
      isLoading={isSubmitting}
      onClick={handleToggle}
    >
      {isActive ? "Deactivate Agent" : "Activate Agent"}
    </Button>
  );
}
