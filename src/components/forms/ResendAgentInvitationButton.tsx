"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";
import { resendAgentInvitationAction } from "@/server/actions/agent.actions";

export function ResendAgentInvitationButton({ agentId }: { agentId: string }) {
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function resend() {
    setIsSubmitting(true);
    let result: Awaited<ReturnType<typeof resendAgentInvitationAction>>;
    try {
      result = await resendAgentInvitationAction(agentId);
    } catch {
      showToast({ type: "error", message: "The invitation could not be sent. Please try again." });
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);
    showToast({
      type: result.success ? "success" : "error",
      message: result.success ? "Verification invitation sent." : result.message,
    });
  }

  return (
    <Button type="button" variant="secondary" isLoading={isSubmitting} onClick={resend}>
      Resend Verification Email
    </Button>
  );
}
