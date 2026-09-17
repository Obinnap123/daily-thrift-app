import { z } from "zod";

const money = z.coerce
  .number({ message: "Enter a valid amount" })
  .positive("Amount must be greater than zero")
  .max(100_000_000, "Amount is too large");

export const requestContributionCorrectionSchema = z.object({
  contributionId: z.string().min(1),
  requestReason: z.string().trim().min(5, "Explain why this payment needs correction").max(500),
});

export const reviewContributionCorrectionSchema = z
  .object({
    correctionRequestId: z.string().min(1),
    decision: z.enum(["APPROVED", "REJECTED"]),
    reviewNote: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine((value) => value.decision === "APPROVED" || Boolean(value.reviewNote), {
    message: "Enter a reason for rejecting this request",
    path: ["reviewNote"],
  });

export const applyContributionCorrectionSchema = z.object({
  correctionRequestId: z.string().min(1),
  correctedAmount: money,
  correctedPaymentMethod: z.enum(["CASH", "BANK_TRANSFER"]),
  correctedNote: z.string().trim().max(300).optional().or(z.literal("")),
});

export type RequestContributionCorrectionInput = z.infer<typeof requestContributionCorrectionSchema>;
export type ReviewContributionCorrectionInput = z.infer<typeof reviewContributionCorrectionSchema>;
export type ApplyContributionCorrectionInput = z.infer<typeof applyContributionCorrectionSchema>;
