/**
 * Zod validation schemas for authentication-related forms and API routes.
 * ----------------------------------------------------------------------------
 * Keeping these separate from components/routes lets both the client-side
 * form (react-hook-form) and the server-side API route validate with the
 * exact same rules — a single source of truth.
 */
import { z } from "zod";

/** Login form: email + password. */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Registration form for a new platform user (Admin creating an Agent, or an
 * Agent/Admin creating a Customer login). Enforces a reasonably strong
 * password policy.
 */
export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters"),
    email: z.string().trim().toLowerCase().email("Enter a valid email address"),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\s-]{7,15}$/, "Enter a valid phone number")
      .optional()
      .or(z.literal("")),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    confirmPassword: z.string(),
    role: z.enum(["ADMIN", "AGENT", "CUSTOMER"]).default("CUSTOMER"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
