"use client";

import Link from "next/link";
import { format } from "date-fns";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/server/actions/notification.actions";
import { Button } from "@/components/ui/Button";

type Item = { id: string; title: string; message: string; href: string | null; readAt: Date | null; createdAt: Date };

export function NotificationList({ items }: { items: Item[] }) {
  if (!items.length) return <p className="p-6 text-center text-sm text-ink-muted">No notifications yet.</p>;

  return (
    <div>
      <div className="flex justify-end border-b border-line p-3">
        <Button size="sm" variant="secondary" onClick={() => void markAllNotificationsReadAction()}>Mark all read</Button>
      </div>
      <ul className="divide-y divide-line">
        {items.map((item) => {
          const unread = !item.readAt;
          return (
            <li key={item.id} className={unread ? "bg-brand-soft p-4" : "bg-surface p-4"}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
                    <p className="font-semibold text-ink">{item.title}</p>
                    {unread && <span className="sr-only">Unread notification</span>}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-ink-muted">{item.message}</p>
                  <p className="mt-1 text-xs text-ink-subtle">{format(new Date(item.createdAt), "dd MMM yyyy, h:mm a")}</p>
                </div>
                {item.href ? (
                  <Link href={item.href} onClick={() => void markNotificationReadAction(item.id)} className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-brand hover:bg-surface-hover hover:text-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">View</Link>
                ) : unread ? (
                  <button onClick={() => void markNotificationReadAction(item.id)} className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-brand hover:bg-surface-hover hover:text-brand-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">Mark read</button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
