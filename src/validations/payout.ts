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
  payoutMethod: z.enum(["CASH", "BANK_TRANSFER"]),
  payoutDate: z.coerce.date({ message: "Select a valid payout date" }),
  note: z.string().trim().max(300, "Note is too long").optional().or(z.literal("")),
});

export type RecordPayoutInput = z.infer<typeof recordPayoutSchema>;
