/**
 * Zod validation schemas for savings plans and daily contribution recording.
 */
import { z } from "zod";

const decimalAmount = z.preprocess(
  (val) => (typeof val === "string" ? val.trim() : val),
  z.coerce
    .number({ message: "Enter a valid amount" })
    .positive("Amount must be greater than zero")
    .max(100_000_000, "Amount is too large")
);

/**
 * Start a new savings cycle for a customer (Admin or the customer's own
 * Agent). Creates the ContributionPlan that Daily Contribution Recording,
 * Savings Progress, and eventually Payout all hang off of.
 */
export const createContributionPlanSchema = z.object({
  customerProfileId: z.string().min(1),
  dailyAmount: decimalAmount,
  /// Number of PAID days required to complete this cycle. Defaults to the
  /// business's standard 31-day daily-thrift cycle but is editable per
  /// customer in case of a different arrangement.
  durationDays: z.coerce
    .number()
    .int("Must be a whole number of days")
    .min(1, "Must be at least 1 day")
    .max(3650, "Duration is too long"),
  startDate: z.coerce.date({ message: "Select a valid start date" }),
});

export type CreateContributionPlanInput = z.infer<typeof createContributionPlanSchema>;

/**
 * Record today's collection outcome for one customer — either COLLECTED
 * (with an amount) or MISSED (no amount). Used from the Agent's daily
 * "Today's Collections" screen. The server always uses the CURRENT
 * calendar date, never a client-supplied one — see recordContribution()
 * comment for why backdating isn't allowed through this form.
 */
export const recordContributionSchema = z
  .object({
    customerProfileId: z.string().min(1),
    status: z.enum(["COLLECTED", "MISSED"]),
    amount: decimalAmount.optional(),
    note: z.string().trim().max(300, "Note is too long").optional().or(z.literal("")),
  })
  .refine((data) => data.status === "MISSED" || data.amount !== undefined, {
    message: "Enter the amount collected",
    path: ["amount"],
  });

export type RecordContributionInput = z.infer<typeof recordContributionSchema>;

/**
 * "Quick Pay" — record a COLLECTED payment for a customer from the modal
 * available on both the Admin and Agent dashboards (and, once built, the
 * Customer Tracking page). Always records status = COLLECTED (Quick Pay is
 * not used to mark a day as missed — that stays on the existing Today's
 * Collections screen via recordContributionSchema above).
 *
 * paymentDate: present in the schema so an Admin CAN backdate/override a
 * payment date; recordContribution() enforces server-side that only an
 * Admin's request may actually use a date other than today() — an Agent
 * request that includes any paymentDate is silently pinned back to
 * today() by the service, never trusted from the client.
 *
 * isOverride / overrideReason: only ever honored when the caller is an
 * Admin (re-checked server-side in the service) — this is what allows an
 * Admin to record an approved same-day duplicate payment. `overrideReason`
 * is required whenever `isOverride` is true.
 */
export const quickPaySchema = z
  .object({
    customerProfileId: z.string().min(1, "Select a customer"),
    amount: decimalAmount,
    paymentMethod: z.enum(["CASH", "BANK_TRANSFER"]),
    paymentDate: z.coerce.date({ message: "Select a valid payment date" }).optional(),
    note: z.string().trim().max(300, "Note is too long").optional().or(z.literal("")),
    isOverride: z.boolean().optional().default(false),
    overrideReason: z.string().trim().max(300, "Reason is too long").optional().or(z.literal("")),
  })
  .refine((data) => !data.isOverride || !!data.overrideReason, {
    message: "Enter a reason for overriding the duplicate-payment check",
    path: ["overrideReason"],
  });

export type QuickPayInput = z.infer<typeof quickPaySchema>;
