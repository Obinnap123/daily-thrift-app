"use client";

/**
 * Edit Customer form (client component) — Admin or the customer's own Agent.
 * Editable fields: full name, phone, ID number. Agent assignment and photo
 * are deliberately handled by separate, dedicated flows (see
 * editCustomerSchema comment in validations/customer.ts).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
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
    idNumber: string;
  };
}

export function EditCustomerForm({ customer }: EditCustomerFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EditCustomerInput>({
    resolver: zodResolver(editCustomerSchema),
    defaultValues: {
      customerProfileId: customer.id,
      fullName: customer.fullName,
      phone: customer.phone ?? "",
      idNumber: customer.idNumber,
    },
  });

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
        autoComplete="tel"
        error={errors.phone?.message}
        {...register("phone")}
      />
      <Input
        label="ID number"
        error={errors.idNumber?.message}
        {...register("idNumber")}
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
