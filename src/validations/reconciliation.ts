/**
 * Zod validation schemas for End-of-Day cash reconciliation.
 */
import { z } from "zod";

const decimalAmount = z.preprocess(
  (val) => (typeof val === "string" ? val.trim() : val),
  z.coerce
    .number({ message: "Enter a valid amount" })
    .min(0, "Amount cannot be negative")
    .max(100_000_000, "Amount is too large")
);

/** Agent submits their End-of-Day report for today. */
export const submitReconciliationSchema = z.object({
  actualCash: decimalAmount,
  agentNote: z.string().trim().max(500, "Note is too long").optional().or(z.literal("")),
});

export type SubmitReconciliationInput = z.infer<typeof submitReconciliationSchema>;

/** Admin approves or rejects a submitted report. */
export const reviewReconciliationSchema = z.object({
  reconciliationId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  reviewNote: z.string().trim().max(500, "Note is too long").optional().or(z.literal("")),
});

export type ReviewReconciliationInput = z.infer<typeof reviewReconciliationSchema>;
