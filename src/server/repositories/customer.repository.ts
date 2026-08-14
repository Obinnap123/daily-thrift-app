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
import { toSkipTake, DEFAULT_PAGE_SIZE } from "@/lib/pagination";

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

export interface ListCustomersOptions {
  /** Scope to a single agent's customers (Agent role). Omit for Admin (all). */
  agentId?: string;
  /** Free-text search across name, phone, ID number, and customer code. */
  search?: string;
  /** Filter to only active or only inactive customers. Omit for "all". */
  status?: "active" | "inactive";
  /** Filter to customers assigned to a specific agent (Admin filter dropdown). */
  filterAgentId?: string;
  page?: number;
  pageSize?: number;
}

/**
 * List customer profiles for a management page, with optional search,
 * status filter, agent filter, and pagination — all applied at the
 * database level.
 */
export async function listCustomersPaginated(options: ListCustomersOptions = {}) {
  const {
    agentId,
    search,
    status,
    filterAgentId,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = options;

  type CustomerFindManyArgs = Parameters<typeof prisma.customerProfile.findMany>[0];
  const where: NonNullable<CustomerFindManyArgs>["where"] = {
    // Agent-scoping takes precedence: if both agentId (session scope) and
    // filterAgentId (Admin UI filter) were somehow both set, agentId wins
    // — an Agent's session scope must never be overridable by a query param.
    assignedAgentId: agentId ?? filterAgentId ?? undefined,
    ...(status === "active" ? { user: { isActive: true } } : {}),
    ...(status === "inactive" ? { user: { isActive: false } } : {}),
    ...(search
      ? {
          OR: [
            { customerCode: { contains: search, mode: "insensitive" } },
            { idNumber: { contains: search, mode: "insensitive" } },
            { user: { name: { contains: search, mode: "insensitive" } } },
            { user: { phone: { contains: search } } },
          ],
        }
      : {}),
  };

  const [customers, totalCount] = await Promise.all([
    prisma.customerProfile.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, phone: true, isActive: true, createdAt: true } },
        assignedAgent: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      ...toSkipTake(page, pageSize),
    }),
    prisma.customerProfile.count({ where }),
  ]);

  return { customers, totalCount };
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

/** Fetch the raw underlying User id for a given CustomerProfile — used to
 * validate phone-duplicate checks during edits (excluding the customer's
 * own current record from the "already registered" check). */
export async function findCustomerProfileWithUserId(customerProfileId: string) {
  return prisma.customerProfile.findUnique({
    where: { id: customerProfileId },
    select: {
      id: true,
      userId: true,
      idNumber: true,
      assignedAgentId: true,
      passportPhotoUrl: true,
      user: { select: { phone: true } },
    },
  });
}

/**
 * Count this customer's Contribution and Payout rows — the guard used by
 * deleteCustomer() to decide whether a "delete registration" request is
 * safe. A customer with ANY recorded payment or payout has real financial
 * history that must never be erased (audit trail), so deletion is only
 * ever allowed when both counts are zero — i.e. a registration that was
 * created but never actually used yet. See customer.service.ts#deleteCustomer.
 */
export async function countCustomerFinancialActivity(customerProfileId: string) {
  const [contributionCount, payoutCount] = await Promise.all([
    prisma.contribution.count({ where: { customerProfileId } }),
    prisma.payout.count({ where: { customerProfileId } }),
  ]);
  return { contributionCount, payoutCount };
}

/**
 * List active customers NOT currently assigned to the given agent — used
 * to populate the "assign customers to this agent" multi-select on the
 * Agent detail page (an agent obviously can't be assigned a customer
 * that's already theirs).
 */
export async function listCustomersNotAssignedToAgent(agentId: string) {
  return prisma.customerProfile.findMany({
    where: { assignedAgentId: { not: agentId }, user: { isActive: true } },
    include: {
      user: { select: { id: true, name: true, phone: true } },
      assignedAgent: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}
