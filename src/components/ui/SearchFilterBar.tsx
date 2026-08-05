"use client";

/**
 * Search + optional status filter bar for list pages (Agents, Customers).
 * ----------------------------------------------------------------------------
 * Debounces the search text (300ms) and pushes it into the URL as `?q=...`
 * (and `?status=...` if a status filter is configured) using
 * `router.replace` — filtering happens server-side (in the page's Server
 * Component, via the repository's `where` clause), this component only
 * manages the URL state. Changing the search term always resets `page`
 * back to 1 so you don't land on an empty "page 3 of 1".
 */
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface StatusOption {
  value: string;
  label: string;
}

interface SearchFilterBarProps {
  placeholder?: string;
  /** If provided, renders a status <select> alongside the search input. */
  statusOptions?: StatusOption[];
}

export function SearchFilterBar({
  placeholder = "Search…",
  statusOptions,
}: SearchFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    // Any filter change invalidates the current page number.
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams({ q: query || undefined });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label="Search"
          className="min-h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink shadow-sm placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
        />
      </div>

      {statusOptions && (
        <select
          aria-label="Filter by status"
          defaultValue={searchParams.get("status") ?? ""}
          onChange={(event) => pushParams({ status: event.target.value || undefined })}
          className="min-h-11 rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 sm:w-48"
        >
          <option value="">All statuses</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
