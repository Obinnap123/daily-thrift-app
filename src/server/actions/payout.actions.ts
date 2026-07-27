"use server";

/**
 * Server Action for recording a manual payout — ADMIN only. Approving and
 * recording a payout is deliberately restricted to Admins (not Agents),
 * since it is the final, irreversible step that closes out a customer's
 * savings cycle.
 */
import { requireRole } from "@/lib/session";
import { recordPayout } from "@/server/services/payout.service";
import type { RecordPayoutInput } from "@/validations/payout";
import { revalidatePath } from "next/cache";

export async function recordPayoutAction(input: RecordPayoutInput) {
  const user = await requireRole("ADMIN");

  const result = await recordPayout(input, user.id);

  if (result.success) {
    revalidatePath("/admin/payouts");
    revalidatePath("/admin/customers");
    revalidatePath("/admin/reports");
  }

  return result;
}
