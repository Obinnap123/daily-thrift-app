"use client";

/**
 * Register Customer form (client component).
 * ----------------------------------------------------------------------------
 * Shared by both the Admin ("/admin/customers/new") and Agent
 * ("/agent/customers/new") registration pages. The only difference between
 * the two contexts is whether the "Assigned Agent" field is a visible
 * dropdown (Admin, who may choose any agent) or is hidden entirely (Agent,
 * who can only ever register customers under themselves).
 *
 * IMPORTANT: hiding the field here is a UX nicety, not the real security
 * boundary — the Server Action (registerCustomerAction) forcibly overrides
 * assignedAgentId to the caller's own id when the caller is an AGENT, no
 * matter what this form sends. See server/actions/customer.actions.ts.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { registerCustomerSchema, type RegisterCustomerInput } from "@/validations/customer";
import { registerCustomerAction } from "@/server/actions/customer.actions";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";
import type { AgentOption } from "@/server/repositories/agent.repository";

interface RegisterCustomerFormProps {
  /** Redirect target after a successful registration. */
  redirectTo: string;
  /**
   * Agents to show in the "Assigned Agent" dropdown. Pass `undefined` (or
   * omit) when the current user IS the agent (their own customers) — the
   * field is hidden and the value defaults to their own id server-side.
   */
  agents?: AgentOption[];
  /** The current agent's own id, used as a hidden default when agents is omitted. */
  currentAgentId?: string;
}

export function RegisterCustomerForm({
  redirectTo,
  agents,
  currentAgentId,
}: RegisterCustomerFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterCustomerInput>({
    resolver: zodResolver(registerCustomerSchema),
    defaultValues: {
      assignedAgentId: currentAgentId ?? "",
    },
  });

  async function onSubmit(data: RegisterCustomerInput) {
    setFormError(null);

    const result = await registerCustomerAction(data);

    if (!result.success) {
      setFormError(result.message);
      showToast({ type: "error", message: result.message });
      if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          setError(field as keyof RegisterCustomerInput, { message });
        }
      }
      return;
    }

    showToast({
      type: "success",
      message: `Customer registered successfully (Code: ${result.data.customerCode}).`,
    });
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Input
        label="Full name"
        autoComplete="name"
        placeholder="e.g. Chidinma Okafor"
        error={errors.fullName?.message}
        {...register("fullName")}
      />
      <Input
        label="Phone number"
        type="tel"
        autoComplete="tel"
        placeholder="0803 123 4567"
        error={errors.phone?.message}
        {...register("phone")}
      />
      <p className="-mt-3 text-xs text-gray-500">
        The customer will log in using this phone number.
      </p>

      <Input
        label="ID number"
        placeholder="e.g. National ID, Voter's Card number"
        error={errors.idNumber?.message}
        {...register("idNumber")}
      />

      {agents ? (
        <Select
          label="Assigned agent"
          error={errors.assignedAgentId?.message}
          {...register("assignedAgentId")}
        >
          <option value="">Select an agent…</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} {agent.email ? `(${agent.email})` : ""}
            </option>
          ))}
        </Select>
      ) : (
        // Agent context: assignedAgentId is fixed to the current agent and
        // not shown as an editable field.
        <input type="hidden" {...register("assignedAgentId")} />
      )}

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
        Register Customer
      </Button>
    </form>
  );
}
