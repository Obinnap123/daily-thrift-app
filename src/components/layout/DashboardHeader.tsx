"use client";

/**
 * Shared header used across all three dashboards (Admin, Agent, Customer).
 * Shows the signed-in user's name/role and a sign-out control.
 */
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getUnreadNotificationCountAction } from "@/server/actions/notification.actions";

export function DashboardHeader({ title }: { title: string }) {
  const { data: session } = useSession();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (session?.user.role === "ADMIN" || session?.user.role === "AGENT") {
      void getUnreadNotificationCountAction().then(setUnread);
    }
  }, [session?.user.role]);

  return (
    <header className="app-header app-chrome flex min-h-16 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 transition-[margin] sm:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold text-ink sm:text-lg">{title}</h1>
        {session?.user && (
          <p className="truncate text-xs text-ink-muted sm:text-sm">
            {session.user.name} · <span className="capitalize">{session.user.role.toLowerCase()}</span>
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {(session?.user.role === "ADMIN" || session?.user.role === "AGENT") && <Link href="/notifications" className="relative inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm font-medium text-ink-muted hover:bg-surface-hover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"><span className="hidden sm:inline">Notifications</span><span className="sm:hidden">Alerts</span><span className="sr-only">, {unread} unread</span>{unread > 0 && <span aria-hidden="true" className="ml-1.5 rounded-full bg-red-700 px-1.5 py-0.5 text-xs text-white">{unread}</span>}</Link>}
        <Button variant="secondary" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}><span className="hidden sm:inline">Sign out</span><span className="sm:hidden">Exit</span></Button>
      </div>
    </header>
  );
}
