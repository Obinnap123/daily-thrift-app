/**
 * Payout data-access layer.
 */
import { prisma } from "@/lib/prisma";
import { toSkipTake, DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { toDateOnly } from "@/lib/date";

export async function findPayoutById(payoutId: string) {
  return prisma.payout.findUnique({
    where: { id: payoutId },
    include: {
      customerProfile: { include: { user: { select: { name: true, phone: true } } } },
      approvedBy: { select: { id: true, name: true } },
      contributionPlan: true,
    },
  });
}

export async function findPayoutByPlanId(contributionPlanId: string) {
  return prisma.payout.findUnique({ where: { contributionPlanId } });
}

/** Look up a payout by its printed receipt number — used by the printable receipt page. */
export async function findPayoutByReceiptNumber(receiptNumber: string) {
  return prisma.payout.findUnique({
    where: { receiptNumber },
    include: {
      customerProfile: { include: { user: { select: { name: true, phone: true } } } },
      approvedBy: { select: { id: true, name: true } },
      contributionPlan: true,
    },
  });
}

export interface ListPayoutsOptions {
  search?: string;
  page?: number;
  pageSize?: number;
  start?: Date;
  end?: Date;
}

/** Paginated payout history — used by both the Payout module's history tab and Reports. */
export async function listPayoutsPaginated(options: ListPayoutsOptions = {}) {
  const { search, page = 1, pageSize = DEFAULT_PAGE_SIZE, start, end } = options;

  type PayoutFindManyArgs = Parameters<typeof prisma.payout.findMany>[0];
  const where: NonNullable<PayoutFindManyArgs>["where"] = {
    ...(start || end
      ? {
          payoutDate: {
            ...(start ? { gte: toDateOnly(start) } : {}),
            ...(end ? { lte: toDateOnly(end) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { receiptNumber: { contains: search, mode: "insensitive" } },
            { customerProfile: { customerCode: { contains: search, mode: "insensitive" } } },
            { customerProfile: { user: { name: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [payouts, totalCount] = await Promise.all([
    prisma.payout.findMany({
      where,
      include: {
        customerProfile: { include: { user: { select: { name: true } } } },
        approvedBy: { select: { name: true } },
      },
      orderBy: { payoutDate: "desc" },
      ...toSkipTake(page, pageSize),
    }),
    prisma.payout.count({ where }),
  ]);

  return { payouts, totalCount };
}

export interface PayoutReportOptions {
  search?: string;
  start?: Date;
  end?: Date;
}

/**
 * Full (non-paginated) payout list for a date range/search — the Reports >
 * Payout History view and its PDF/Excel export both need every matching
 * row at once (not one page at a time), unlike the Payout module's history
 * tab which uses `listPayoutsPaginated` above.
 */
export async function listPayoutsForReport(options: PayoutReportOptions = {}) {
  const { search, start, end } = options;

  type PayoutFindManyArgs = Parameters<typeof prisma.payout.findMany>[0];
  const where: NonNullable<PayoutFindManyArgs>["where"] = {
    ...(start || end
      ? {
          payoutDate: {
            ...(start ? { gte: toDateOnly(start) } : {}),
            ...(end ? { lte: toDateOnly(end) } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { receiptNumber: { contains: search, mode: "insensitive" } },
            { customerProfile: { customerCode: { contains: search, mode: "insensitive" } } },
            { customerProfile: { user: { name: { contains: search, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  return prisma.payout.findMany({
    where,
    include: {
      customerProfile: { include: { user: { select: { name: true } } } },
      approvedBy: { select: { name: true } },
    },
    orderBy: { payoutDate: "desc" },
  });
}

/** All payouts for one customer, newest first — customer's own payout history. */
export async function listPayoutsForCustomer(customerProfileId: string) {
  return prisma.payout.findMany({
    where: { customerProfileId },
    include: { approvedBy: { select: { name: true } } },
    orderBy: { payoutDate: "desc" },
  });
}
