"use client";

/**
 * Search + optional status filter bar for server-rendered list pages.
 * Search is debounced for speed but also has an explicit submit action so the
 * interaction remains obvious on mobile and with assistive technology.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { cn } from "@/lib/utils";

interface StatusOption {
  value: string;
  label: string;
}

interface SearchFilterBarProps {
  placeholder?: string;
  /** If provided, renders a status select alongside the search input. */
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
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushParams = useCallback(
    (next: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      // A filter change invalidates the current page number.
      params.delete("page");
      const nextSearch = params.toString();
      startTransition(() => {
        router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams]
  );

  const applySearch = useCallback(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery === (searchParams.get("q") ?? "")) return;
    pushParams({ q: normalizedQuery || undefined });
  }, [pushParams, query, searchParams]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(applySearch, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [applySearch, query]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    applySearch();
  }

  return (
    <form
      role="search"
      aria-label="Search and filter records"
      aria-busy={isPending}
      onSubmit={handleSubmit}
      className={cn(
        "grid min-w-0 gap-3 sm:items-center",
        statusOptions
          ? "sm:grid-cols-[minmax(0,20rem)_12rem_auto]"
          : "sm:grid-cols-[minmax(0,20rem)_auto]"
      )}
    >
      <div className="relative min-w-0">
        <input
          type="search"
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          aria-label="Search"
          className="min-h-11 min-w-0 w-full max-w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-base text-ink shadow-sm placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 sm:text-sm"
        />
      </div>

      {statusOptions && (
        <select
          aria-label="Filter by status"
          value={searchParams.get("status") ?? ""}
          onChange={(event) =>
            pushParams({ status: event.target.value || undefined })
          }
          className="min-h-11 min-w-0 w-full max-w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-base text-ink shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 sm:text-sm"
        >
          <option value="">All statuses</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-solid px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-solid-hover focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-canvas disabled:cursor-wait disabled:opacity-70 sm:w-auto"
      >
        {isPending ? "Searching…" : "Search"}
      </button>

      <span className="sr-only" role="status" aria-live="polite">
        {isPending ? "Updating search results" : ""}
      </span>
    </form>
  );
}
