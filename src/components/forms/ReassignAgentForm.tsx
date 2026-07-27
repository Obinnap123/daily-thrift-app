"use client";

/**
 * Reassign ("rotate") Agent form — Admin only.
 * ----------------------------------------------------------------------------
 * Changes which agent is responsible for a customer. The current agent is
 * excluded from the dropdown (reassigning to the same agent is meaningless
 * and is also rejected server-side as a friendly validation error).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { reassignAgentSchema, type ReassignAgentInput } from "@/validations/customer";
import { reassignCustomerAgentAction } from "@/server/actions/customer.actions";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";
import type { AgentOption } from "@/server/repositories/agent.repository";

interface ReassignAgentFormProps {
  customerProfileId: string;
  /** All active agents EXCEPT the one currently assigned. */
  availableAgents: AgentOption[];
  onSuccess?: () => void;
}

export function ReassignAgentForm({
  customerProfileId,
  availableAgents,
  onSuccess,
}: ReassignAgentFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReassignAgentInput>({
    resolver: zodResolver(reassignAgentSchema),
    defaultValues: { customerProfileId },
  });

  async function onSubmit(data: ReassignAgentInput) {
    setFormError(null);
    setSuccessMessage(null);

    const result = await reassignCustomerAgentAction(data);

    if (!result.success) {
      setFormError(result.message);
      showToast({ type: "error", message: result.message });
      if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          setError(field as keyof ReassignAgentInput, { message });
        }
      }
      return;
    }

    setSuccessMessage("Agent reassigned successfully.");
    showToast({ type: "success", message: "Agent reassigned successfully." });
    reset({ customerProfileId, newAgentId: "", note: "" });
    router.refresh();
    onSuccess?.();
  }

  if (availableAgents.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No other active agents are available to reassign this customer to.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" {...register("customerProfileId")} />

      <Select
        label="New agent"
        error={errors.newAgentId?.message}
        {...register("newAgentId")}
      >
        <option value="">Select a new agent…</option>
        {availableAgents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name} {agent.email ? `(${agent.email})` : ""}
          </option>
        ))}
      </Select>

      <Input
        label="Reason (optional)"
        placeholder="e.g. Route rebalancing, previous agent left"
        error={errors.note?.message}
        {...register("note")}
      />

      {formError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {formError}
        </p>
      )}
      {successMessage && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {successMessage}
        </p>
      )}

      <Button type="submit" isLoading={isSubmitting} variant="secondary">
        Reassign Agent
      </Button>
    </form>
  );
}
