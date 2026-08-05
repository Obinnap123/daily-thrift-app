/**
 * Small colored status badge (e.g. Active/Inactive, role labels).
 */
import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

type BadgeTone = "green" | "gray" | "red" | "blue" | "amber";

const toneStyles: Record<BadgeTone, string> = {
  green: "bg-brand-soft text-brand-ink",
  gray: "bg-surface-muted text-ink-muted",
  red: "bg-danger-soft text-danger",
  blue: "bg-info-soft text-info",
  amber: "bg-warning-soft text-warning",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ className, tone = "gray", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneStyles[tone],
        className
      )}
      {...props}
    />
  );
}
