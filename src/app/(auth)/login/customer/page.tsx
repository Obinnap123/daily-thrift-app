/**
 * Customer login page.
 * Server component wrapper — see /login/page.tsx (chooser) and
 * /login/LoginForm.tsx (the shared client form, parameterized by role).
 */
import { Suspense } from "react";
import Link from "next/link";
import { LoginForm } from "../LoginForm";

export default function CustomerLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Davchuks Daily Thrift</h1>
          <p className="mt-1 text-sm text-gray-500">Customer Login</p>
        </div>
        {/* LoginForm reads the `callbackUrl` query param via useSearchParams(),
            which requires a Suspense boundary during static prerendering. */}
        <Suspense fallback={null}>
          <LoginForm role="customer" />
        </Suspense>
        <p className="mt-6 text-center text-sm text-gray-500">
          Not a Customer?{" "}
          <Link href="/login" className="font-medium text-emerald-700 hover:underline">
            Choose a different login
          </Link>
        </p>
      </div>
    </div>
  );
}
