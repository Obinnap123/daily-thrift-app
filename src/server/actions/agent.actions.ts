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

export async function createAgentAction(input: CreateAgentInput) {
  await requireRole("ADMIN");

  const result = await createAgent(input);

  if (result.success) {
    // Refresh the agents list page's cached data after a successful create.
    revalidatePath("/admin/agents");
  }

  return result;
}

export async function updateAgentAction(input: EditAgentInput) {
  await requireRole("ADMIN");

  const result = await updateAgent(input);

  if (result.success) {
    revalidatePath("/admin/agents");
    revalidatePath(`/admin/agents/${input.id}`);
  }

  return result;
}

export async function setAgentActiveAction(input: SetAgentActiveInput) {
  await requireRole("ADMIN");

  const result = await setAgentActive(input);

  if (result.success) {
    revalidatePath("/admin/agents");
    revalidatePath(`/admin/agents/${input.id}`);
  }

  return result;
}
