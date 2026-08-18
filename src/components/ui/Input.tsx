/**
 * Reusable form Input with built-in label and validation error display.
 * Designed to drop straight into react-hook-form via register().
 */
import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className="flex min-w-0 max-w-full flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-ink">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "min-h-11 min-w-0 max-w-full w-full rounded-xl border bg-surface px-3.5 py-2.5 text-base text-ink shadow-sm sm:text-sm",
            "placeholder:text-ink-subtle",
            "focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25",
            error ? "border-danger" : "border-line-strong",
            className
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
