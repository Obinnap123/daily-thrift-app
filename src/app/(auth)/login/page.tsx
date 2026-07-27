/**
 * Login page.
 * ----------------------------------------------------------------------------
 * Server component wrapper that renders the client-side LoginForm. Kept as a
 * separate file from the form itself so we can later add server-rendered
 * content (e.g. branding, marketing copy) without turning this into a client
 * component.
 */
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Davchuks Daily Thrift</h1>
          <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
        </div>
        {/* LoginForm reads the `callbackUrl` query param via useSearchParams(),
            which requires a Suspense boundary during static prerendering. */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
