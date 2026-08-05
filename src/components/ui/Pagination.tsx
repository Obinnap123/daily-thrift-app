/**
 * Server-rendered pagination control (plain <Link>s, no client JS needed).
 * ----------------------------------------------------------------------------
 * Preserves any other search params on the page (e.g. `?q=...&status=...`)
 * when changing the page number, so search/filter + pagination compose
 * correctly together.
 */
import Link from "next/link";
import { cn } from "@/lib/utils";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  /** The current page's URL search params, used to preserve filters. */
  searchParams: Record<string, string | undefined>;
  /** Base path for the list page (e.g. "/admin/agents"). */
  basePath: string;
}

function buildHref(basePath: string, params: Record<string, string | undefined>, page: number) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const queryString = query.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}

export function Pagination({ currentPage, totalPages, searchParams, basePath }: PaginationProps) {
  if (totalPages <= 1) return null;

  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-stretch justify-between gap-3 border-t border-line px-4 py-3 min-[380px]:flex-row min-[380px]:items-center sm:px-6"
    >
      <p className="text-center text-sm text-ink-muted min-[380px]:text-left">
        Page <span className="font-medium text-ink">{currentPage}</span> of{" "}
        <span className="font-medium text-ink">{totalPages}</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <PageLink
          href={buildHref(basePath, searchParams, currentPage - 1)}
          disabled={!canGoPrevious}
        >
          &larr; Previous
        </PageLink>
        <PageLink href={buildHref(basePath, searchParams, currentPage + 1)} disabled={!canGoNext}>
          Next &rarr;
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-xl border border-line px-3 py-1.5 text-sm text-ink-subtle">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-xl border border-line-strong px-3 py-1.5 text-sm text-ink hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
      )}
    >
      {children}
    </Link>
  );
}
