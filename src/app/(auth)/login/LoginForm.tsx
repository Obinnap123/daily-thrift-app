"use client";

/**
 * Login form (client component).
 * ----------------------------------------------------------------------------
 * Uses react-hook-form for form state + Zod (via @hookform/resolvers) for
 * validation, then calls NextAuth's `signIn("credentials", ...)`. We use
 * `redirect: false` so we can show inline errors instead of a full page
 * navigation to a generic NextAuth error page.
 *
 * The underlying credential is always a single "identifier" field (email or
 * phone — see lib/auth.ts for how the server decides which lookup to
 * perform) — that hasn't changed. What DOES change per `role` is purely
 * presentational: the field's label/placeholder/autocomplete hint, so an
 * Admin/Agent sees "Email Address" and a Customer sees "Phone Number",
 * matching whichever dedicated login page (/login/admin, /login/agent,
 * /login/customer) rendered this form. There is still exactly one
 * `loginSchema` / one `authorize()` code path underneath.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginSchema, type LoginInput } from "@/validations/auth";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type LoginRole = "admin" | "agent" | "customer";

const ROLE_FIELD_CONFIG: Record<
  LoginRole,
  { label: string; placeholder: string; type: string; autoComplete: string; hint: string }
> = {
  admin: {
    label: "Email Address",
    placeholder: "you@example.com",
    type: "email",
    autoComplete: "username",
    hint: "Sign in with your Admin email address.",
  },
  agent: {
    label: "Email Address",
    placeholder: "you@example.com",
    type: "email",
    autoComplete: "username",
    hint: "Sign in with your Agent email address.",
  },
  customer: {
    label: "Phone Number",
    placeholder: "08031234567",
    type: "tel",
    autoComplete: "username",
    hint: "Sign in with the phone number registered by your agent.",
  },
};

interface LoginFormProps {
  /** Which dedicated login page rendered this form — controls the
   * identifier field's label/placeholder/type only (see file header). */
  role: LoginRole;
}

export function LoginForm({ role }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const fieldConfig = ROLE_FIELD_CONFIG[role];

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  async function onSubmit(data: LoginInput) {
    setFormError(null);

    const result = await signIn("credentials", {
      ...data,
      redirect: false,
    });

    if (result?.error) {
      // Intentionally generic — do not reveal whether the account exists.
      setFormError("Invalid credentials. Please check and try again.");
      return;
    }

    const callbackUrl = searchParams.get("callbackUrl") ?? "/";
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Input
          label={fieldConfig.label}
          type={fieldConfig.type}
          autoComplete={fieldConfig.autoComplete}
          placeholder={fieldConfig.placeholder}
          error={errors.identifier?.message}
          {...register("identifier")}
        />
        <PasswordInput
          label="Password"
          autoComplete="current-password"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register("password")}
        />

        {formError && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}

        <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full">
          Sign in
        </Button>

        <p className="text-center text-xs text-gray-500">{fieldConfig.hint}</p>
      </form>
    </Card>
  );
}
