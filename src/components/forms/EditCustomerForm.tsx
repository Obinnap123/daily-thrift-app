"use client";

/**
 * Edit Customer form (client component) — Admin or the customer's own Agent.
 * Editable fields: full name, phone, customer card number. Agent assignment
 * are deliberately handled by separate, dedicated flows (see
 * editCustomerSchema comment in validations/customer.ts).
 */
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { editCustomerSchema, type EditCustomerInput } from "@/validations/customer";
import { updateCustomerAction } from "@/server/actions/customer.actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/providers/ToastProvider";

interface EditCustomerFormProps {
  customer: {
    id: string;
    fullName: string;
    phone: string | null;
    customerNumber: string;
  };
}

export function EditCustomerForm({ customer }: EditCustomerFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EditCustomerInput>({
    resolver: zodResolver(editCustomerSchema),
    defaultValues: {
      customerProfileId: customer.id,
      fullName: customer.fullName,
      phone: customer.phone ?? "",
      customerNumber: customer.customerNumber,
    },
  });
  const phoneDigits = (useWatch({ control, name: "phone" }) ?? "").length;

  async function onSubmit(data: EditCustomerInput) {
    setFormError(null);

    const result = await updateCustomerAction(data);

    if (!result.success) {
      setFormError(result.message);
      showToast({ type: "error", message: result.message });
      if (result.fieldErrors) {
        for (const [field, message] of Object.entries(result.fieldErrors)) {
          setError(field as keyof EditCustomerInput, { message });
        }
      }
      return;
    }

    showToast({ type: "success", message: "Customer details updated." });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <input type="hidden" {...register("customerProfileId")} />
      <Input
        label="Full name"
        autoComplete="name"
        error={errors.fullName?.message}
        {...register("fullName")}
      />
      <Input
        label="Phone number"
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={11}
        autoComplete="tel"
        error={errors.phone?.message}
        aria-describedby="customer-phone-help"
        onInput={(event) => {
          event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 11);
        }}
        {...register("phone")}
      />
      <p id="customer-phone-help" className="-mt-3 text-xs text-ink-muted">
        {phoneDigits >= 11
          ? "11 of 11 digits entered. Edit the number if needed."
          : `${phoneDigits} of 11 digits entered.`}
      </p>
      <Input
        label="Customer No."
        error={errors.customerNumber?.message}
        {...register("customerNumber")}
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
