/**
 * Admin login page.
 * Server component wrapper — see /login/page.tsx (chooser) and
 * /login/LoginForm.tsx (the shared client form, parameterized by role).
 */
import { Suspense } from "react";
import { LoginForm } from "../LoginForm";
import { AuthLayout, LoginFormSkeleton } from "@/components/auth/AuthLayout";

export default function AdminLoginPage() {
  return (
    <AuthLayout title="Admin sign in" subtitle="Manage people, collections, payouts, and reporting." backToChooser>
        {/* LoginForm reads the `callbackUrl` query param via useSearchParams(),
            which requires a Suspense boundary during static prerendering. */}
        <Suspense fallback={<LoginFormSkeleton />}>
          <LoginForm role="admin" />
        </Suspense>
    </AuthLayout>
  );
}
