"use client";

/**
 * Create Agent form (client component).
 * ----------------------------------------------------------------------------
 * Client-side validation via Zod gives instant feedback; the Server Action
 * (createAgentAction) re-validates everything server-side and additionally
 * checks for duplicate email/phone — those friendly duplicate messages are
 * shown via `fieldErrors` returned from the action, merged into the form's
 * own error state.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { createAgentSchema, type CreateAgentInput } from "@/validations/auth";
import { createAgentAction } from "@/server/actions/agent.actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";

export function CreateAgentForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateAgentInput>({
    resolver: zodResolver(createAgentSchema),
  });

  async function onSubmit(data: CreateAgentInput) {
    setFormError(null);

    const result = await createAgentAction(data);

    if (!result.success) {
      setFormError(result.message);
      showToast({ type: "error", message: result.message });
      // Surface field-specific duplicate errors (e.g. "email already exists")
      // directly under the relevant input, same as client-side validation.
      if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          setError(field as keyof CreateAgentInput, { message });
        }
      }
      return;
    }

    showToast({ type: "success", message: "Agent created successfully." });
    router.push("/admin/agents");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Input
        label="Full name"
        autoComplete="name"
        placeholder="e.g. John Adeyemi"
        error={errors.name?.message}
        {...register("name")}
      />
      <Input
        label="Email address"
        type="email"
        autoComplete="email"
        placeholder="agent@example.com"
        error={errors.email?.message}
        {...register("email")}
      />
      <Input
        label="Phone number (optional)"
        type="tel"
        autoComplete="tel"
        placeholder="0803 123 4567"
        error={errors.phone?.message}
        {...register("phone")}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        error={errors.password?.message}
        {...register("password")}
      />
      <Input
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      {formError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full">
        Create Agent
      </Button>
    </form>
  );
}
