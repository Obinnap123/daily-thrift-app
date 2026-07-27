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
}

export function CustomerSearchSelect({
  options,
  value,
  onChange,
  placeholder = "Search by name, phone, or code…",
  error,
}: CustomerSearchSelectProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((option) => option.id === value) ?? null;

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
      <label htmlFor="customer-search-input" className="text-sm font-medium text-gray-700">
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
          "w-full rounded-lg border px-3.5 py-2.5 text-sm text-gray-900 shadow-sm",
          "placeholder:text-gray-400",
          "focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500",
          error ? "border-red-400" : "border-gray-300"
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
          className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3.5 py-2 text-sm text-gray-500">No customers match.</li>
          ) : (
            filtered.map((option) => (
              <li key={option.id} role="option" aria-selected={option.id === value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.id);
                    setIsOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full flex-col items-start px-3.5 py-2 text-left text-sm hover:bg-emerald-50",
                    option.id === value && "bg-emerald-50"
                  )}
                >
                  <span className="font-medium text-gray-900">{option.name}</span>
                  <span className="text-xs text-gray-500">
                    {option.customerCode}
                    {option.phone ? ` · ${option.phone}` : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
