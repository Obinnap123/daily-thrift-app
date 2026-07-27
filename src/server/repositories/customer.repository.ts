/**
 * Customer data-access layer.
 * ----------------------------------------------------------------------------
 * Every query here that lists/fetches customers is scope-aware: it accepts
 * an explicit `agentId` filter so callers (services, pages) can enforce
 * "an Agent only ever sees their own assigned customers" at the query level
 * — not just by filtering an already-fetched full list in memory, which
 * would be easy to forget and leak data across agents.
 */
import { prisma } from "@/lib/prisma";

/**
 * List customer profiles, optionally scoped to a single agent.
 * - Admin callers: pass `agentId: undefined` to see everyone.
 * - Agent callers: MUST pass their own `agentId` — see requireRole() call
 *   sites in the pages that use this, which is what actually enforces this
 *   isn't bypassable from the client.
 */
export async function listCustomerProfiles(options?: { agentId?: string }) {
  return prisma.customerProfile.findMany({
    where: options?.agentId ? { assignedAgentId: options.agentId } : undefined,
    include: {
      user: { select: { id: true, name: true, phone: true, isActive: true, createdAt: true } },
      assignedAgent: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Fetch a single customer profile by its CustomerProfile id, including
 * enough related data to render a profile page and the assignment history.
 */
export async function findCustomerProfileById(customerProfileId: string) {
  return prisma.customerProfile.findUnique({
    where: { id: customerProfileId },
    include: {
      user: true,
      assignedAgent: { select: { id: true, name: true, email: true } },
      assignmentLogs: {
        orderBy: { createdAt: "desc" },
        include: {
          previousAgent: { select: { id: true, name: true } },
          newAgent: { select: { id: true, name: true } },
          changedBy: { select: { id: true, name: true, role: true } },
        },
      },
    },
  });
}

/** Fetch a customer profile by the underlying User id (e.g. from a session). */
export async function findCustomerProfileByUserId(userId: string) {
  return prisma.customerProfile.findUnique({
    where: { userId },
    include: {
      user: true,
      assignedAgent: { select: { id: true, name: true, email: true, phone: true } },
    },
  });
}

/** Check whether an ID number is already registered (uniqueness pre-check). */
export async function findCustomerProfileByIdNumber(idNumber: string) {
  return prisma.customerProfile.findUnique({ where: { idNumber } });
}
