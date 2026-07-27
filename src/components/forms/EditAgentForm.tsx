"use client";

/**
 * Edit Agent form (client component) — Admin only.
 * Same validation rules as CreateAgentForm minus password (see
 * editAgentSchema comment for why password changes are a separate concern).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { editAgentSchema, type EditAgentInput } from "@/validations/auth";
import { updateAgentAction } from "@/server/actions/agent.actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";

interface EditAgentFormProps {
  agent: { id: string; name: string; email: string | null; phone: string | null };
}

export function EditAgentForm({ agent }: EditAgentFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EditAgentInput>({
    resolver: zodResolver(editAgentSchema),
    defaultValues: {
      id: agent.id,
      name: agent.name,
      email: agent.email ?? "",
      phone: agent.phone ?? "",
    },
  });

  async function onSubmit(data: EditAgentInput) {
    setFormError(null);

    const result = await updateAgentAction(data);

    if (!result.success) {
      setFormError(result.message);
      showToast({ type: "error", message: result.message });
      if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          setError(field as keyof EditAgentInput, { message });
        }
      }
      return;
    }

    showToast({ type: "success", message: "Agent details updated." });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" {...register("id")} />
      <Input
        label="Full name"
        autoComplete="name"
        error={errors.name?.message}
        {...register("name")}
      />
      <Input
        label="Email address"
        type="email"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <Input
        label="Phone number (optional)"
        type="tel"
        autoComplete="tel"
        error={errors.phone?.message}
        {...register("phone")}
      />

      {formError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}

      <Button type="submit" isLoading={isSubmitting} className="w-full">
        Save Changes
      </Button>
    </form>
  );
}
