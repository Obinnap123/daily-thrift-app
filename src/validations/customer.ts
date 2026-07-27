/**
 * Zod validation schemas for customer registration & agent reassignment.
 */
import { z } from "zod";

const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

/**
 * Customer registration form.
 * ----------------------------------------------------------------------------
 * Used by both Agents (registering their own customers — assignedAgentId is
 * implied to be themselves and hidden in the UI) and Admins (who can pick
 * any agent from a dropdown). The schema itself is shared; which fields are
 * shown/editable is a UI-layer decision (see RegisterCustomerForm).
 */
export const registerCustomerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name must be at least 2 characters"),
    phone: z
      .string()
      .trim()
      .regex(/^[0-9+\s-]{7,15}$/, "Enter a valid phone number"),
    idNumber: z
      .string()
      .trim()
      .min(4, "ID number must be at least 4 characters")
      .max(50, "ID number is too long"),
    /// The agent this customer will be assigned to. Required — every
    /// customer must have exactly one responsible agent at all times.
    assignedAgentId: z.string().min(1, "Select an agent"),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;

/**
 * Agent reassignment ("rotation") form — Admin only.
 * Changes which agent is responsible for a given customer and records the
 * change in the AgentAssignmentLog audit trail.
 */
export const reassignAgentSchema = z.object({
  customerProfileId: z.string().min(1),
  newAgentId: z.string().min(1, "Select a new agent"),
  note: z.string().trim().max(500, "Note is too long").optional().or(z.literal("")),
});

export type ReassignAgentInput = z.infer<typeof reassignAgentSchema>;

/**
 * Customer edit form (Admin or the customer's own Agent).
 * ----------------------------------------------------------------------------
 * Deliberately does NOT include `assignedAgentId` — agent assignment is
 * changed only through the dedicated, audited `reassignAgentSchema` /
 * ReassignAgentForm flow above, never as a side effect of a routine profile
 * edit. Also excludes password (not a routine-edit concern) and
 * `customerCode` (system-generated once, immutable thereafter).
 */
export const editCustomerSchema = z.object({
  customerProfileId: z.string().min(1),
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters"),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\s-]{7,15}$/, "Enter a valid phone number"),
  idNumber: z
    .string()
    .trim()
    .min(4, "ID number must be at least 4 characters")
    .max(50, "ID number is too long"),
});

export type EditCustomerInput = z.infer<typeof editCustomerSchema>;

/**
 * Bulk "assign customers to an agent" form (Admin only) — used from the
 * Agent detail page to move one or more existing customers onto a
 * specific agent in one action. Distinct from `reassignAgentSchema`
 * (which rotates ONE customer from its current detail page) — this is the
 * agent-centric equivalent: picking several customers and moving them
 * onto THIS agent at once.
 */
export const bulkAssignCustomersSchema = z.object({
  agentId: z.string().min(1),
  customerProfileIds: z.array(z.string().min(1)).min(1, "Select at least one customer"),
  note: z.string().trim().max(500, "Note is too long").optional().or(z.literal("")),
});

export type BulkAssignCustomersInput = z.infer<typeof bulkAssignCustomersSchema>;

/**
 * Delete a customer registration — Admin only (see deleteCustomerSchema
 * comment in customer.service.ts for why this is permanently blocked once
 * the customer has ANY recorded financial activity).
 */
export const deleteCustomerSchema = z.object({
  customerProfileId: z.string().min(1),
});

export type DeleteCustomerInput = z.infer<typeof deleteCustomerSchema>;
