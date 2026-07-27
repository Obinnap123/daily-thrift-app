"use server";

/**
 * Server Actions for End-of-Day cash reconciliation.
 *  - submitReconciliationAction: AGENT only (an agent submits their OWN report).
 *  - reviewReconciliationAction: ADMIN only.
 */
import { requireRole } from "@/lib/session";
import { submitReconciliation, reviewReconciliation } from "@/server/services/reconciliation.service";
import type { SubmitReconciliationInput, ReviewReconciliationInput } from "@/validations/reconciliation";
import { revalidatePath } from "next/cache";

export async function submitReconciliationAction(input: SubmitReconciliationInput) {
  const user = await requireRole("AGENT");

  const result = await submitReconciliation(input, user.id);

  if (result.success) {
    revalidatePath("/agent/reconciliation");
    revalidatePath("/admin/reconciliations");
  }

  return result;
}

export async function reviewReconciliationAction(input: ReviewReconciliationInput) {
  const user = await requireRole("ADMIN");

  const result = await reviewReconciliation(input, user.id);

  if (result.success) {
    revalidatePath("/admin/reconciliations");
    revalidatePath("/agent/reconciliation");
  }

  return result;
}
