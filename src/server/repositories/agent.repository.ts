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
import { toSkipTake, DEFAULT_PAGE_SIZE } from "@/lib/pagination";

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

export interface ListAgentsOptions {
  /** Free-text search across name, email, and phone (case-insensitive). */
  search?: string;
  /** Filter to only active or only inactive agents. Omit for "all". */
  status?: "active" | "inactive";
  page?: number;
  pageSize?: number;
}

/**
 * List agents for the Admin's management page, with optional search,
 * status filter, and pagination. Search/filter happen at the database
 * level (never "fetch everything then filter in memory") so this scales
 * as the agent list grows.
 */
export async function listAgentsPaginated(options: ListAgentsOptions = {}) {
  const { search, status, page = 1, pageSize = DEFAULT_PAGE_SIZE } = options;

  // Deliberately typed as `Parameters<...>[0]["where"]` rather than
  // importing Prisma's generated internal `UserWhereInput` type — this
  // keeps the repository decoupled from the generated client's internal
  // type layout (see Step 2 decision on resolveIdentifierLookup for the
  // same reasoning), while still getting full autocomplete/type-checking
  // from the actual `findMany` call below.
  type UserFindManyArgs = Parameters<typeof prisma.user.findMany>[0];
  const where: NonNullable<UserFindManyArgs>["where"] = {
    role: "AGENT",
    ...(status === "active" ? { isActive: true } : {}),
    ...(status === "inactive" ? { isActive: false } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
          ],
        }
      : {}),
  };

  const [agents, totalCount] = await Promise.all([
    prisma.user.findMany({
      where,
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
      ...toSkipTake(page, pageSize),
    }),
    prisma.user.count({ where }),
  ]);

  return { agents, totalCount };
}

/**
 * Most recent agent-assignment changes system-wide (new registrations +
 * rotations) — the data source for the Admin Dashboard's "Recent Agent
 * Activities" feed. Contribution/reconciliation activity is agent-driven
 * too, but assignment changes are the one agent-centric event that isn't
 * already covered by "Recent Transactions", so this is what fills that
 * feed without duplicating the transactions list.
 */
export async function listRecentAgentAssignmentLogs(limit = 10) {
  return prisma.agentAssignmentLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      customerProfile: { include: { user: { select: { name: true } } } },
      previousAgent: { select: { name: true } },
      newAgent: { select: { name: true } },
      changedBy: { select: { name: true } },
    },
  });
}

/** Fetch a single agent by id (used to validate reassignment targets, etc.). */
export async function findAgentById(agentId: string) {
  return prisma.user.findFirst({
    where: { id: agentId, role: "AGENT" },
  });
}

/**
 * Fetch a single agent with the fields needed for the Edit Agent page and
 * the Agent detail / "assign customers" page.
 */
export async function findAgentDetailById(agentId: string) {
  return prisma.user.findFirst({
    where: { id: agentId, role: "AGENT" },
    include: {
      managedCustomers: {
        include: { user: { select: { id: true, name: true, phone: true, isActive: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}
