/**
 * Agent data-access layer.
 * ----------------------------------------------------------------------------
 * Keeping raw Prisma queries here (rather than scattered through pages/API
 * routes) means the query shape for "what counts as an agent" lives in one
 * place and can be reused by registration forms, reassignment dropdowns,
 * and admin listing pages without duplicating the `where role: "AGENT"`
 * filter everywhere.
 */
import { prisma } from "@/lib/prisma";

/** Minimal shape needed to populate an "assign to agent" dropdown. */
export interface AgentOption {
  id: string;
  name: string;
  email: string | null;
}

/** List all active agents, alphabetically — used to populate dropdowns. */
export async function listActiveAgents(): Promise<AgentOption[]> {
  return prisma.user.findMany({
    where: { role: "AGENT", isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}

/** List ALL agents (including disabled ones) for the Admin's agent management page. */
export async function listAllAgents() {
  return prisma.user.findMany({
    where: { role: "AGENT" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isActive: true,
      createdAt: true,
      _count: { select: { managedCustomers: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Fetch a single agent by id (used to validate reassignment targets, etc.). */
export async function findAgentById(agentId: string) {
  return prisma.user.findFirst({
    where: { id: agentId, role: "AGENT" },
  });
}
