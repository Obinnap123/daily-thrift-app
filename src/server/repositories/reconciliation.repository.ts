/**
 * DailyReconciliation data-access layer.
 */
import { prisma } from "@/lib/prisma";
import { toDateOnly } from "@/lib/date";
import { toSkipTake, DEFAULT_PAGE_SIZE } from "@/lib/pagination";

/** The agent's reconciliation report for a specific date, if one exists. */
export async function findReconciliationForAgentAndDate(agentId: string, date: Date) {
  return prisma.dailyReconciliation.findUnique({
    where: {
      agentId_reconciliationDate: { agentId, reconciliationDate: toDateOnly(date) },
    },
  });
}

export async function findReconciliationById(id: string) {
  return prisma.dailyReconciliation.findUnique({
    where: { id },
    include: { agent: { select: { id: true, name: true } } },
  });
}

/** An agent's own reconciliation history, newest first. */
export async function listReconciliationsForAgent(agentId: string, limit = 30) {
  return prisma.dailyReconciliation.findMany({
    where: { agentId },
    orderBy: { reconciliationDate: "desc" },
    take: limit,
  });
}

export interface ListReconciliationsOptions {
  status?: "SUBMITTED" | "APPROVED" | "REJECTED";
  page?: number;
  pageSize?: number;
}

/** Paginated system-wide reconciliation list — Admin review queue. */
export async function listReconciliationsPaginated(options: ListReconciliationsOptions = {}) {
  const { status, page = 1, pageSize = DEFAULT_PAGE_SIZE } = options;

  const [reports, totalCount] = await Promise.all([
    prisma.dailyReconciliation.findMany({
      where: status ? { status } : undefined,
      include: { agent: { select: { id: true, name: true } }, reviewedBy: { select: { name: true } } },
      orderBy: { reconciliationDate: "desc" },
      ...toSkipTake(page, pageSize),
    }),
    prisma.dailyReconciliation.count({ where: status ? { status } : undefined }),
  ]);

  return { reports, totalCount };
}
