/**
 * Zod validation schemas for authentication-related forms and API routes.
 * ----------------------------------------------------------------------------
 * Keeping these separate from components/routes lets both the client-side
 * form (react-hook-form) and the server-side API route validate with the
 * exact same rules — a single source of truth.
 */
import { z } from "zod";

/**
 * Login form.
 * ----------------------------------------------------------------------------
 * Admin/Agent sign in with EMAIL. Customers sign in with PHONE NUMBER
 * (many customers in this business don't have an email address). Rather
 * than showing two different login forms, we accept a single "identifier"
 * field and let the server figure out — by shape — whether it looks like
 * an email or a phone number, then look the user up accordingly.
 *
 * We deliberately keep this validation loose (non-empty string) rather than
 * strict email/phone format checks, because a real user might mistype
 * either format and we want the *server* to give the final generic
 * "invalid credentials" response either way (see lib/auth.ts) — not have
 * the client reject a real phone number just because a regex was too strict.
 */
export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "Enter your email or phone number"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Shared password policy used by every account-creation form. */
const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

/**
 * Agent creation form (Admin only).
 * Agents log in with email, so email is required here.
 */
export const createAgentSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters"),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\s-]{7,15}$/, "Enter a valid phone number")
      .optional()
      .or(z.literal("")),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
