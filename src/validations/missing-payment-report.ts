import { z } from "zod";

export const submitMissingPaymentReportSchema = z.object({
  paymentDate: z.coerce.date({ message: "Select the date you made the payment" }),
  reportedAmount: z.coerce
    .number({ message: "Enter a valid amount" })
    .positive("Amount must be greater than zero")
    .max(100_000_000, "Amount is too large"),
  customerNote: z.string().trim().max(500, "Note is too long").optional().or(z.literal("")),
});

export const reviewMissingPaymentReportSchema = z.object({
  reportId: z.string().min(1),
  decision: z.enum(["RESOLVED", "DISMISSED"]),
  reviewNote: z.string().trim().min(3, "Enter a short review note").max(500, "Note is too long"),
});

export type SubmitMissingPaymentReportInput = z.infer<typeof submitMissingPaymentReportSchema>;
export type ReviewMissingPaymentReportInput = z.infer<typeof reviewMissingPaymentReportSchema>;
