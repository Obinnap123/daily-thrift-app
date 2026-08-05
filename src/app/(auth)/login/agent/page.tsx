/**
 * Agent login page.
 * Server component wrapper — see /login/page.tsx (chooser) and
 * /login/LoginForm.tsx (the shared client form, parameterized by role).
 */
import { Suspense } from "react";
import { LoginForm } from "../LoginForm";
import { AuthLayout, LoginFormSkeleton } from "@/components/auth/AuthLayout";

export default function AgentLoginPage() {
  return (
    <AuthLayout title="Agent sign in" subtitle="Record collections and manage your assigned customers." backToChooser>
        {/* LoginForm reads the `callbackUrl` query param via useSearchParams(),
            which requires a Suspense boundary during static prerendering. */}
        <Suspense fallback={<LoginFormSkeleton />}>
          <LoginForm role="agent" />
        </Suspense>
    </AuthLayout>
  );
}
