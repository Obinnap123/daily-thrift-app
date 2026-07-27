"use server";

/**
 * Server Actions for Agent management (Admin-only).
 * ----------------------------------------------------------------------------
 * This is the ONLY place that decides "is the caller allowed to create an
 * Agent?" — by calling requireRole("ADMIN") before doing anything else. The
 * service function itself (server/services/agent.service.ts) has no idea
 * who's calling it; role enforcement always happens here, at the boundary.
 */
import { requireRole } from "@/lib/session";
import { createAgent } from "@/server/services/agent.service";
import type { CreateAgentInput } from "@/validations/auth";
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
