"use server";

/**
 * Server Actions for Agent management (Admin-only).
 * ----------------------------------------------------------------------------
 * This is the ONLY place that decides "is the caller allowed to
 * create/edit/deactivate an Agent?" — by calling requireRole("ADMIN") before
 * doing anything else. The service functions themselves
 * (server/services/agent.service.ts) have no idea who's calling them; role
 * enforcement always happens here, at the boundary.
 */
import { requireRole } from "@/lib/session";
import { createAgent, updateAgent, setAgentActive } from "@/server/services/agent.service";
import type { CreateAgentInput, EditAgentInput, SetAgentActiveInput } from "@/validations/auth";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/server/services/audit.service";

export async function createAgentAction(input: CreateAgentInput) {
  const user = await requireRole("ADMIN");

  const result = await createAgent(input);
  await writeAuditLog({ actorId: user.id, actorRole: user.role, action: "AGENT_CREATED", outcome: result.success ? "SUCCESS" : "FAILURE", entityType: "User", entityId: result.success ? result.data.id : undefined, summary: result.success ? `Agent ${input.name} created.` : result.message });

  if (result.success) {
    // Refresh the agents list page's cached data after a successful create.
    revalidatePath("/admin/agents");
  }

  return result;
}

export async function updateAgentAction(input: EditAgentInput) {
  const user = await requireRole("ADMIN");

  const result = await updateAgent(input);
  await writeAuditLog({ actorId: user.id, actorRole: user.role, action: "AGENT_UPDATED", outcome: result.success ? "SUCCESS" : "FAILURE", entityType: "User", entityId: input.id, summary: result.success ? "Agent details updated." : result.message });

  if (result.success) {
    revalidatePath("/admin/agents");
    revalidatePath(`/admin/agents/${input.id}`);
  }

  return result;
}

export async function setAgentActiveAction(input: SetAgentActiveInput) {
  const user = await requireRole("ADMIN");

  const result = await setAgentActive(input);
  await writeAuditLog({ actorId: user.id, actorRole: user.role, action: "AGENT_STATUS_CHANGED", outcome: result.success ? "SUCCESS" : "FAILURE", entityType: "User", entityId: input.id, summary: result.success ? `Agent status changed to ${input.isActive ? "active" : "inactive"}.` : result.message });

  if (result.success) {
    revalidatePath("/admin/agents");
    revalidatePath(`/admin/agents/${input.id}`);
  }

  return result;
}
