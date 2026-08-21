"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  completeAgentInvitationSchema,
  type CompleteAgentInvitationInput,
} from "@/validations/auth";
import { completeAgentInvitationAction } from "@/server/actions/staff-email-verification.actions";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/providers/ToastProvider";

export function SetAgentPasswordForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CompleteAgentInvitationInput>({
    resolver: zodResolver(completeAgentInvitationSchema),
    defaultValues: { token },
  });

  async function onSubmit(data: CompleteAgentInvitationInput) {
    setFormError(null);
    let result: Awaited<ReturnType<typeof completeAgentInvitationAction>>;
    try {
      result = await completeAgentInvitationAction(data);
    } catch {
      const message = "Your account could not be verified. Please check your connection and try again.";
      setFormError(message);
      showToast({ type: "error", message });
      return;
    }
    if (!result.success) {
      setFormError(result.message);
      showToast({ type: "error", message: result.message });
      return;
    }

    showToast({ type: "success", message: "Email verified. You can now sign in." });
    router.replace("/login/agent?verified=1");
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <input type="hidden" {...register("token")} />
        <p className="rounded-xl bg-brand-soft px-3 py-2 text-sm text-brand-ink">
          Verifying <span className="font-semibold">{email}</span>
        </p>
        <PasswordInput
          label="Create password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          error={errors.password?.message}
          {...register("password")}
        />
        <PasswordInput
          label="Confirm password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register("confirmPassword")}
        />
        <p className="text-xs leading-relaxed text-ink-muted">
          Use at least 8 characters with an uppercase letter, lowercase letter, and number.
        </p>
        {formError && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{formError}</p>}
        <Button type="submit" isLoading={isSubmitting} className="w-full">
          Verify Email &amp; Create Password
        </Button>
      </form>
    </Card>
  );
}
