/**
 * Reusable Button component.
 * ----------------------------------------------------------------------------
 * Centralizing button styles now means every future form/dashboard (Steps
 * 2-13) automatically looks consistent instead of re-styling buttons ad hoc.
 */
import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

const variantStyles: Record<Variant, string> = {
  primary:
    "bg-brand-solid text-white hover:bg-brand-solid-hover focus-visible:outline-brand",
  secondary:
    "border border-line-strong bg-surface text-ink hover:bg-surface-hover focus-visible:outline-brand",
  danger: "bg-red-700 text-white hover:bg-red-800 focus-visible:outline-danger dark:bg-red-600",
  ghost: "bg-transparent text-ink-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-brand",
};

const sizeStyles: Record<Size, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-3 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl font-medium transition-colors sm:min-h-0",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-60",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading && (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
