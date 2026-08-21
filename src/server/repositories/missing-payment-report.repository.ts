import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE, toSkipTake } from "@/lib/pagination";

export type MissingPaymentReportFilter = "OPEN" | "RESOLVED" | "DISMISSED";

export async function listMissingPaymentReportsForCustomer(customerProfileId: string) {
  return prisma.missingPaymentReport.findMany({
    where: { customerProfileId },
    include: { reviewedBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
}

export async function listMissingPaymentReportsPaginated(options: {
  status?: MissingPaymentReportFilter;
  page?: number;
  pageSize?: number;
} = {}) {
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const where = options.status ? { status: options.status } : {};

  const [reports, totalCount] = await Promise.all([
    prisma.missingPaymentReport.findMany({
      where,
      include: {
        customerProfile: {
          include: {
            user: { select: { name: true, phone: true } },
            assignedAgent: { select: { name: true, phone: true } },
          },
        },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      ...toSkipTake(page, pageSize),
    }),
    prisma.missingPaymentReport.count({ where }),
  ]);

  return { reports, totalCount };
}
