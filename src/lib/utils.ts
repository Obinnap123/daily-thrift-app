/**
 * Small shared utilities used across UI components.
 */
import { type ClassValue, clsx } from "clsx";

/**
 * Merge conditional class names together. A minimal alternative to the
 * common `cn()` helper (clsx handles the conditional joining logic we need;
 * we can layer in `tailwind-merge` later if class conflicts become an issue).
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
