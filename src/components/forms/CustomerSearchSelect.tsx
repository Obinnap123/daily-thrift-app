"use client";

/**
 * Customer dropdown with search — used inside the Quick Pay modal.
 * ----------------------------------------------------------------------------
 * Client-side filter over a pre-fetched customer list (name / phone /
 * customer code), rather than a debounced server search: the list passed
 * in is already correctly scoped server-side (an Agent only ever receives
 * their own customers — see listCustomerProfiles({ agentId }) call sites),
 * and thrift customer counts per agent/admin are small enough that
 * filtering in the browser is instant and avoids an extra network
 * round-trip per keystroke.
 */
import { useMemo, useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

export interface CustomerSearchOption {
  id: string;
  name: string;
  phone: string | null;
  customerCode: string;
}

interface CustomerSearchSelectProps {
  options: CustomerSearchOption[];
  value: string | null;
  onChange: (customerProfileId: string) => void;
  placeholder?: string;
  error?: string;
  onSearch?: (query: string) => Promise<CustomerSearchOption[]>;
}

export function CustomerSearchSelect({
  options,
  value,
  onChange,
  placeholder = "Search by name, phone, or code…",
  error,
  onSearch,
}: CustomerSearchSelectProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [remoteOptions, setRemoteOptions] = useState<CustomerSearchOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = [...options, ...remoteOptions].find((option) => option.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (option) =>
        option.name.toLowerCase().includes(q) ||
        option.customerCode.toLowerCase().includes(q) ||
        (option.phone ?? "").toLowerCase().includes(q)
    );
  }, [options, query]);

  useEffect(() => {
    if (!isOpen || !onSearch) return;
    let active = true;
    const timer = setTimeout(() => {
      setIsLoading(true);
      void onSearch(query)
        .then((result) => { if (active) setRemoteOptions(result); })
        .finally(() => { if (active) setIsLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [isOpen, onSearch, query]);

  const visibleOptions = onSearch ? remoteOptions : filtered;

  // Close the dropdown when clicking outside.
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <label htmlFor="customer-search-input" className="text-sm font-medium text-ink">
        Customer
      </label>
      <input
        id="customer-search-input"
        type="text"
        autoComplete="off"
        value={isOpen ? query : selected ? `${selected.name} (${selected.customerCode})` : ""}
        onFocus={() => {
          setIsOpen(true);
          setQuery("");
        }}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        className={cn(
          "min-h-11 w-full rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-ink shadow-sm",
          "placeholder:text-ink-subtle focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25",
          error ? "border-danger" : "border-line-strong"
        )}
        aria-invalid={!!error}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls="customer-search-listbox"
      />

      {isOpen && (
        <ul
          id="customer-search-listbox"
          role="listbox"
          className="absolute top-full z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-line bg-surface-raised py-1 shadow-xl"
        >
          {isLoading ? (
            <li className="px-3.5 py-3 text-sm text-ink-muted" role="status">Searching customers…</li>
          ) : visibleOptions.length === 0 ? (
            <li className="px-3.5 py-3 text-sm text-ink-muted">No active customers match.</li>
          ) : (
            visibleOptions.map((option) => (
              <li key={option.id} role="option" aria-selected={option.id === value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex min-h-12 w-full flex-col items-start px-3.5 py-2 text-left text-sm hover:bg-brand-soft",
                    option.id === value && "bg-brand-soft"
                  )}
                >
                  <span className="font-medium text-ink">{option.name}</span>
                  <span className="text-xs text-ink-muted">
                    {option.customerCode}
                    {option.phone ? ` · ${option.phone}` : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
