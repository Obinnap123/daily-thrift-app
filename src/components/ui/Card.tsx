/**
 * Simple Card container used throughout dashboards for grouping content.
 */
import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface p-4 text-ink shadow-[0_1px_2px_rgb(var(--shadow-color)/0.08)] sm:p-6",
        className
      )}
      {...props}
    />
  );
}
