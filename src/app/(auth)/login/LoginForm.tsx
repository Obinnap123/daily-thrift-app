"use client";

/**
 * Login form (client component).
 * ----------------------------------------------------------------------------
 * Uses react-hook-form for form state + Zod (via @hookform/resolvers) for
 * validation, then calls NextAuth's `signIn("credentials", ...)`. We use
 * `redirect: false` so we can show inline errors instead of a full page
 * navigation to a generic NextAuth error page.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { loginSchema, type LoginInput } from "@/validations/auth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);

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
      // Intentionally generic — do not reveal whether the email exists.
      setFormError("Invalid email or password.");
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
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register("email")}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register("password")}
        />

        {formError && (
          <p role="alert" className="text-sm text-red-600">
            {formError}
          </p>
        )}

        <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full">
          Sign in
        </Button>
      </form>
    </Card>
  );
}
