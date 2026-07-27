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
      className="flex items-center justify-between gap-4 border-t border-gray-200 px-4 py-3 sm:px-6"
    >
      <p className="text-sm text-gray-500">
        Page <span className="font-medium text-gray-900">{currentPage}</span> of{" "}
        <span className="font-medium text-gray-900">{totalPages}</span>
      </p>
      <div className="flex gap-2">
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
      <span className="cursor-not-allowed rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-400">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
      )}
    >
      {children}
    </Link>
  );
}
