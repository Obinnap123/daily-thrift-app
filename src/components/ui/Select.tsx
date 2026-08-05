/**
 * Reusable form Select with built-in label and validation error display.
 * Mirrors the API of Input.tsx for consistency when used with react-hook-form.
 */
import { cn } from "@/lib/utils";
import { SelectHTMLAttributes, forwardRef } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, children, ...props }, ref) => {
    const selectId = id ?? props.name;
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-ink">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            "min-h-11 w-full rounded-xl border bg-surface px-3.5 py-2.5 text-sm text-ink shadow-sm",
            "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25",
            error ? "border-danger" : "border-line-strong",
            className
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${selectId}-error` : undefined}
          {...props}
        >
          {children}
        </select>
        {error && (
          <p id={`${selectId}-error`} className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";
