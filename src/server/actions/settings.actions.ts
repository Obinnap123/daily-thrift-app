"use server";

import { requireRole } from "@/lib/session";
import { updateBusinessSettings, type SettingsInput } from "@/server/services/settings.service";
import { writeAuditLog } from "@/server/services/audit.service";
import { revalidatePath } from "next/cache";

export async function updateSettingsAction(input: SettingsInput) {
  const user = await requireRole("ADMIN");
  const result = await updateBusinessSettings(input);
  await writeAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: "SETTINGS_UPDATED",
    outcome: result.success ? "SUCCESS" : "FAILURE",
    entityType: "BusinessSettings",
    entityId: "default",
    summary: result.success ? "Business and operational settings updated." : result.message,
  });
  if (result.success) revalidatePath("/admin/settings");
  return result;
}
