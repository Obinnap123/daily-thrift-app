"use client";

/**
 * Shared header used across all three dashboards (Admin, Agent, Customer).
 * Shows the signed-in user's name/role and a sign-out control.
 */
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";

export function DashboardHeader({ title }: { title: string }) {
  const { data: session } = useSession();

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        {session?.user && (
          <p className="text-sm text-gray-500">
            Signed in as {session.user.name} ({session.user.role})
          </p>
        )}
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        Sign out
      </Button>
    </header>
  );
}
