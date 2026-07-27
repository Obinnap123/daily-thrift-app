/**
 * Small colored status badge (e.g. Active/Inactive, role labels).
 */
import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

type BadgeTone = "green" | "gray" | "red" | "blue" | "amber";

const toneStyles: Record<BadgeTone, string> = {
  green: "bg-emerald-100 text-emerald-800",
  gray: "bg-gray-100 text-gray-700",
  red: "bg-red-100 text-red-700",
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-800",
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
