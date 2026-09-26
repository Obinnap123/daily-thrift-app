import { format } from "date-fns";
import Link from "next/link";
import type { AuditOutcome } from "@/generated/prisma/client";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { requireRole } from "@/lib/session";
import { listAdminActivity } from "@/server/repositories/admin-activity.repository";

interface ActivitySearchParams {
  outcome?: string;
  q?: string;
  after?: string;
  before?: string;
}

export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<ActivitySearchParams>;
}) {
  await requireRole("SUPER_ADMIN");
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 80) ?? "";
  const outcome = parseOutcome(params.outcome);
  const page = await listAdminActivity({
    query: query || undefined,
    outcome,
    after: params.after,
    before: params.before,
  });

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Admin activity" />
      <DashboardNav />
      <main className="flex-1 space-y-5 p-4 sm:p-6">
        <div>
          <h2 className="text-xl font-semibold text-ink">Admin activity</h2>
          <p className="text-sm text-ink-muted">
            Browse recorded Admin actions 25 at a time. Historical actions stay
            visible even if an account is later archived.
          </p>
        </div>

        <form className="flex flex-wrap gap-2">
          <input
            aria-label="Search Admin activity"
            name="q"
            defaultValue={query}
            placeholder="Search actions or details"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-base text-ink sm:text-sm"
          />
          <select
            aria-label="Filter by outcome"
            name="outcome"
            defaultValue={outcome ?? ""}
            className="min-h-11 rounded-xl border border-line bg-surface px-3 text-base text-ink sm:text-sm"
          >
            <option value="">All outcomes</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILURE">Failure</option>
          </select>
          <button className="min-h-11 rounded-xl bg-brand-solid px-4 text-sm font-semibold text-white">
            Filter
          </button>
        </form>

        <Card className="divide-y divide-line p-0">
          {page.events.length === 0 ? (
            <p className="p-6 text-sm text-ink-muted">
              No Admin activity matches this filter.
            </p>
          ) : (
            page.events.map((event) => (
              <article key={event.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-ink">
                    {event.action.replaceAll("_", " ")}
                  </h3>
                  <span
                    className={
                      event.outcome === "FAILURE"
                        ? "text-sm font-medium text-danger"
                        : "text-sm font-medium text-brand"
                    }
                  >
                    {event.outcome.toLowerCase()}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-muted">{event.summary}</p>
                <p className="mt-2 text-xs text-ink-subtle">
                  {event.actorName ?? "Former Admin"} ·{" "}
                  {format(event.createdAt, "dd MMM yyyy, h:mm a")}
                </p>
                <Link
                  href={`/super-admin/activity/${event.id}`}
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
                >
                  View details
                </Link>
              </article>
            ))
          )}
        </Card>

        <nav
          aria-label="Admin activity pages"
          className="flex items-center justify-between gap-3"
        >
          <PaginationLink
            href={activityHref(query, outcome, "before", page.previousCursor)}
            label="Previous"
          />
          <span className="text-xs text-ink-muted">
            Showing up to 25 activities
          </span>
          <PaginationLink
            href={activityHref(query, outcome, "after", page.nextCursor)}
            label="Next"
          />
        </nav>
      </main>
    </div>
  );
}

function parseOutcome(value: string | undefined): AuditOutcome | undefined {
  if (value === "SUCCESS" || value === "FAILURE") return value;
  return undefined;
}

function activityHref(
  query: string,
  outcome: AuditOutcome | undefined,
  cursorName: "before" | "after",
  cursor: string | null,
): string | null {
  if (!cursor) return null;
  const search = new URLSearchParams();
  if (query) search.set("q", query);
  if (outcome) search.set("outcome", outcome);
  search.set(cursorName, cursor);
  return `/super-admin/activity?${search.toString()}`;
}

function PaginationLink({
  href,
  label,
}: {
  href: string | null;
  label: string;
}) {
  if (!href) {
    return (
      <span
        aria-disabled="true"
        className="inline-flex min-h-11 min-w-24 items-center justify-center rounded-xl border border-line px-4 text-sm text-ink-subtle opacity-50"
      >
        {label}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 min-w-24 items-center justify-center rounded-xl border border-line px-4 text-sm font-medium text-ink hover:border-brand hover:text-brand"
    >
      {label}
    </Link>
  );
}
