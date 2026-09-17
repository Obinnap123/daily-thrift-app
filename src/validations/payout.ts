/**
 * Zod validation schema for recording a manual payout.
 * ----------------------------------------------------------------------------
 * No online payment integration: `payoutMethod` only records HOW the money
 * changed hands (cash in person, or a bank transfer made outside this
 * system) — this system never moves money, and `note` must never contain a
 * full bank account number or other payment credential (enforced by policy
 * / UI hint, not a regex — free text is intentionally kept simple here).
 */
import { z } from "zod";

export const recordPayoutSchema = z.object({
  contributionPlanId: z.string().min(1),
  clientRequestId: z.uuid("Invalid payout request. Reload the form and try again."),
  mode: z.enum(["FULL", "PARTIAL"]),
  requestedMonths: z.array(z.object({
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid payout month"),
    customerAmount: z.coerce.number().positive("Enter the amount the customer receives").multipleOf(0.01, "Use no more than two decimal places"),
  })).default([]),
  payoutMethod: z.enum(["CASH", "BANK_TRANSFER"]),
  payoutDate: z.coerce.date({ message: "Select a valid payout date" }),
  note: z.string().trim().max(300, "Note is too long").optional().or(z.literal("")),
}).superRefine((value, context) => {
  if (value.mode === "PARTIAL" && value.requestedMonths.length === 0) {
    context.addIssue({ code: "custom", path: ["requestedMonths"], message: "Select at least one month." });
  }
});

export type RecordPayoutInput = z.infer<typeof recordPayoutSchema>;
