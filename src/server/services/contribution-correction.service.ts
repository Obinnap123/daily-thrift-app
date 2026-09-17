import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { addDaysToDate } from "@/lib/date";
import { calendarMonthKey, calendarMonthStart } from "@/lib/payout-selection";
import {
  assessContributionCorrection,
} from "@/lib/contribution-correction-safety";
import { lockCustomerFinancialState, runFinancialTransaction } from "@/lib/financial-transaction";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { createAuditLog, type AuditActorContext } from "@/server/services/audit.service";
import {
  requestContributionCorrectionSchema,
  reviewContributionCorrectionSchema,
  applyContributionCorrectionSchema,
  type RequestContributionCorrectionInput,
  type ReviewContributionCorrectionInput,
  type ApplyContributionCorrectionInput,
} from "@/validations/contribution-correction";

const EDIT_WINDOW_MS = 60 * 60 * 1000;

class UnsafeCorrectionError extends Error {}

async function checkCorrectionSafety(
  tx: Prisma.TransactionClient,
  contribution: { contributionPlanId: string; amount: unknown; allocations: { coverageDate: Date; amount: unknown; payoutMonthId: string | null }[] },
) {
  const planId = contribution.contributionPlanId;
  const [payoutCount, settledMonths, orphanCount] = await Promise.all([
    tx.payout.count({ where: { contributionPlanId: planId } }),
    tx.payoutMonth.findMany({
      where: { payout: { contributionPlanId: planId } },
      select: { monthStart: true, creditAmount: true },
    }),
    tx.contributionAllocation.count({ where: { contributionPlanId: planId, contributionId: null } }),
  ]);
  return assessContributionCorrection({
    amount: contribution.amount,
    allocations: contribution.allocations,
    payoutCount,
    settledMonths,
    hasOrphanAllocations: orphanCount > 0,
  });
}

export async function requestContributionCorrection(
  input: RequestContributionCorrectionInput,
  agentId: string,
  audit: AuditActorContext,
): Promise<ActionResult<{ correctionRequestId: string }>> {
  const parsed = requestContributionCorrectionSchema.safeParse(input);
  if (!parsed.success) return fail("Please explain why this payment needs correction.");

  const identity = await prisma.contribution.findUnique({
    where: { id: parsed.data.contributionId },
    select: { customerProfileId: true },
  });
  if (!identity) return fail("Payment record not found.");

  const result = await runFinancialTransaction(async (tx) => {
    await lockCustomerFinancialState(tx, identity.customerProfileId);
    const contribution = await tx.contribution.findUnique({
      where: { id: parsed.data.contributionId },
      include: {
        customerProfile: { select: { assignedAgentId: true } },
        allocations: { select: { payoutMonthId: true, coverageDate: true, amount: true } },
      },
    });
    if (!contribution || contribution.status !== "COLLECTED") {
      return { success: false as const, error: "Payment record not found." };
    }
    if (contribution.collectedById !== agentId || contribution.customerProfile.assignedAgentId !== agentId) {
      return { success: false as const, error: "You can only request corrections for payments you recorded for your assigned customers." };
    }
    const safety = await checkCorrectionSafety(tx, contribution);
    if (safety.error) return { success: false as const, error: safety.error };
    const existing = await tx.contributionCorrectionRequest.findFirst({
      where: { contributionId: contribution.id, status: { in: ["REQUESTED", "APPROVED"] } },
      select: { id: true },
    });
    if (existing) {
      return { success: false as const, error: "A correction request is already open for this payment." };
    }

    const created = await tx.contributionCorrectionRequest.create({
      data: {
        contributionId: contribution.id,
        customerProfileId: contribution.customerProfileId,
        requestedById: agentId,
        requestReason: parsed.data.requestReason,
        originalAmount: contribution.amount ?? 0,
        originalPaymentMethod: contribution.paymentMethod,
        originalNote: contribution.note,
      },
    });
    await createAuditLog(tx, {
      actorId: audit.actorId,
      actorRole: audit.actorRole,
      action: "CONTRIBUTION_CORRECTION_REQUESTED",
      outcome: "SUCCESS",
      entityType: "ContributionCorrectionRequest",
      entityId: created.id,
      summary: "Agent requested a payment correction.",
      metadata: { contributionId: contribution.id, originalAmount: Number(contribution.amount ?? 0) },
    }, audit);
    return { success: true as const, request: created };
  });
  if (!result.success) return fail(result.error);
  return ok({ correctionRequestId: result.request.id });
}

export async function reviewContributionCorrection(
  input: ReviewContributionCorrectionInput,
  adminId: string,
  audit: AuditActorContext,
): Promise<ActionResult<{ correctionRequestId: string; agentId: string }>> {
  const parsed = reviewContributionCorrectionSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the review details.");
  const now = new Date();
  const result = await runFinancialTransaction(async (tx) => {
    const request = await tx.contributionCorrectionRequest.findUnique({ where: { id: parsed.data.correctionRequestId } });
    if (!request) return { success: false as const, error: "Correction request not found." };
    if (request.status !== "REQUESTED") return { success: false as const, error: "This request has already been reviewed." };
    const approved = parsed.data.decision === "APPROVED";
    const updated = await tx.contributionCorrectionRequest.updateMany({
      where: { id: request.id, status: "REQUESTED" },
      data: {
        status: parsed.data.decision,
        reviewedById: adminId,
        reviewedAt: now,
        reviewNote: parsed.data.reviewNote || null,
        approvedAt: approved ? now : null,
        editWindowEndsAt: approved ? new Date(now.getTime() + EDIT_WINDOW_MS) : null,
      },
    });
    if (updated.count !== 1) {
      return { success: false as const, error: "This request has already been reviewed." };
    }
    await createAuditLog(tx, {
      actorId: audit.actorId,
      actorRole: audit.actorRole,
      action: `CONTRIBUTION_CORRECTION_${parsed.data.decision}`,
      outcome: "SUCCESS",
      entityType: "ContributionCorrectionRequest",
      entityId: request.id,
      summary: approved ? "Payment correction approved for one hour." : "Payment correction request rejected.",
      metadata: { contributionId: request.contributionId },
    }, audit);
    return { success: true as const, request };
  });
  if (!result.success) return fail(result.error);
  return ok({ correctionRequestId: result.request.id, agentId: result.request.requestedById });
}

async function rebuildUnpaidAllocations(
  tx: Prisma.TransactionClient,
  contributionPlanId: string,
  targetUnpaidBalance: number,
  settledMonthKeys: Set<string>,
) {
  const plan = await tx.contributionPlan.findUnique({ where: { id: contributionPlanId } });
  if (!plan) throw new Error("Savings plan not found.");

  const [contributions, existingAllocations, rates] = await Promise.all([
    tx.contribution.findMany({
      where: { contributionPlanId, status: "COLLECTED" },
      orderBy: [{ collectionDate: "asc" }, { createdAt: "asc" }],
      include: { allocations: { select: { payoutMonthId: true, coverageDate: true } } },
    }),
    tx.contributionAllocation.findMany({
      where: { contributionPlanId },
      select: { coverageDate: true, contributionId: true, payoutMonthId: true },
    }),
    tx.contributionMonthRate.findMany({
      where: { contributionPlanId },
      orderBy: { monthStart: "asc" },
    }),
  ]);

  const protectedContributionIds = new Set(
    contributions
      .filter((contribution) => contribution.allocations.some((allocation) =>
        allocation.payoutMonthId || settledMonthKeys.has(calendarMonthKey(allocation.coverageDate))))
      .map((contribution) => contribution.id),
  );
  const protectedAllocations = existingAllocations.filter(
    (allocation) => allocation.payoutMonthId || settledMonthKeys.has(calendarMonthKey(allocation.coverageDate))
      || (allocation.contributionId && protectedContributionIds.has(allocation.contributionId)),
  );
  const protectedDates = new Set(
    protectedAllocations.map((allocation) => allocation.coverageDate.toISOString().slice(0, 10)),
  );

  await tx.contributionAllocation.deleteMany({
    where: {
      contributionPlanId,
      payoutMonthId: null,
      ...(protectedContributionIds.size > 0
        ? { contributionId: { notIn: [...protectedContributionIds] } }
        : {}),
    },
  });

  const rateByMonth = new Map(rates.map((rate) => [calendarMonthKey(rate.monthStart), Number(rate.dailyAmount)]));
  let inheritedRate = rateByMonth.get(calendarMonthKey(plan.startDate)) ?? Number(plan.dailyAmount);
  let cursor = nextAvailableDate(plan.startDate, protectedDates);
  const protectedGross = await tx.contributionAllocation.aggregate({
    where: {
      contributionPlanId,
      ...(protectedContributionIds.size > 0
        ? { contributionId: { in: [...protectedContributionIds] } }
        : { id: { in: [] } }),
    },
    _sum: { amount: true },
  });
  const unprotectedContributionTotal = contributions
    .filter((contribution) => !protectedContributionIds.has(contribution.id))
    .reduce((sum, contribution) => sum + Number(contribution.amount ?? 0), 0);
  // Any positive opening credit belongs to protected historical money whose
  // allocations cannot be rewritten. Keeping it here prevents an unrelated
  // correction from silently losing that residual balance.
  let credit = Math.max(
    0,
    targetUnpaidBalance
      - Number(protectedGross._sum.amount ?? 0)
      - unprotectedContributionTotal,
  );
  const rebuilt: { contributionPlanId: string; contributionId: string; coverageDate: Date; amount: number }[] = [];

  for (const contribution of contributions) {
    if (protectedContributionIds.has(contribution.id)) continue;
    credit += Number(contribution.amount ?? 0);
    while (rebuilt.length < 3_660) {
      cursor = nextAvailableDate(cursor, protectedDates);
      const key = calendarMonthKey(cursor);
      const rate = rateByMonth.get(key) ?? inheritedRate;
      inheritedRate = rate;
      if (!rateByMonth.has(key)) {
        await tx.contributionMonthRate.create({
          data: { contributionPlanId, monthStart: calendarMonthStart(cursor), dailyAmount: rate },
        });
        rateByMonth.set(key, rate);
      }
      if (credit < rate) break;
      if (settledMonthKeys.has(key)) {
        throw new UnsafeCorrectionError("This correction would change a month with a completed payout. No changes were saved; ask an Admin to review it.");
      }
      rebuilt.push({ contributionPlanId, contributionId: contribution.id, coverageDate: cursor, amount: rate });
      protectedDates.add(cursor.toISOString().slice(0, 10));
      credit -= rate;
      cursor = addDaysToDate(cursor, 1);
    }
  }

  if (rebuilt.length > 0) await tx.contributionAllocation.createMany({ data: rebuilt });
  cursor = nextAvailableDate(cursor, protectedDates);
  await tx.contributionPlan.update({
    where: { id: contributionPlanId },
    data: { creditBalance: credit, nextCoverageDate: cursor },
  });
}

function nextAvailableDate(date: Date, occupied: Set<string>) {
  let cursor = date;
  while (occupied.has(cursor.toISOString().slice(0, 10))) cursor = addDaysToDate(cursor, 1);
  return cursor;
}

export async function applyContributionCorrection(
  input: ApplyContributionCorrectionInput,
  agentId: string,
  audit: AuditActorContext,
): Promise<ActionResult<{ contributionId: string }>> {
  const parsed = applyContributionCorrectionSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the payment details.");

  try {
    const result = await runFinancialTransaction(async (tx) => {
    const identity = await tx.contributionCorrectionRequest.findUnique({
      where: { id: parsed.data.correctionRequestId },
      select: { customerProfileId: true },
    });
    if (!identity) return { success: false as const, error: "Correction request not found." };
    await lockCustomerFinancialState(tx, identity.customerProfileId);
    const request = await tx.contributionCorrectionRequest.findUnique({
      where: { id: parsed.data.correctionRequestId },
      include: {
        contribution: {
          include: {
            customerProfile: { select: { assignedAgentId: true } },
            allocations: { select: { payoutMonthId: true, coverageDate: true, amount: true } },
          },
        },
      },
    });
    if (!request) return { success: false as const, error: "Correction request not found." };
    if (request.requestedById !== agentId || request.contribution.customerProfile.assignedAgentId !== agentId) {
      return { success: false as const, error: "You are not allowed to edit this payment." };
    }
    if (request.status !== "APPROVED") {
      return { success: false as const, error: "This correction has not been approved or was already used." };
    }
    const now = new Date();
    if (!request.editWindowEndsAt || request.editWindowEndsAt <= now) {
      await tx.contributionCorrectionRequest.update({ where: { id: request.id }, data: { status: "EXPIRED" } });
      return { success: false as const, error: "The one-hour edit window has expired. Submit a new request." };
    }
    const safety = await checkCorrectionSafety(tx, request.contribution);
    if (safety.error) return { success: false as const, error: safety.error };

    const currentUnpaid = await tx.contributionAllocation.aggregate({
      where: {
        contributionPlanId: request.contribution.contributionPlanId,
      },
      _sum: { amount: true },
    });
    const planBeforeCorrection = await tx.contributionPlan.findUnique({
      where: { id: request.contribution.contributionPlanId },
      select: { creditBalance: true },
    });
    if (!planBeforeCorrection) {
      return { success: false as const, error: "Savings plan not found." };
    }
    const targetUnpaidBalance = Number(currentUnpaid._sum.amount ?? 0)
      + Number(planBeforeCorrection.creditBalance)
      + parsed.data.correctedAmount
      - Number(request.contribution.amount ?? 0);
    if (targetUnpaidBalance < 0) {
      return { success: false as const, error: "The corrected amount would make the unpaid savings balance invalid." };
    }

    await tx.contribution.update({
      where: { id: request.contributionId },
      data: {
        amount: parsed.data.correctedAmount,
        paymentMethod: parsed.data.correctedPaymentMethod,
        note: parsed.data.correctedNote || null,
      },
    });
    await rebuildUnpaidAllocations(
      tx,
      request.contribution.contributionPlanId,
      targetUnpaidBalance,
      safety.settledMonthKeys,
    );

    const expectedCash = await tx.contribution.aggregate({
      where: {
        collectedById: agentId,
        collectionDate: request.contribution.collectionDate,
        status: "COLLECTED",
        paymentMethod: "CASH",
      },
      _sum: { amount: true },
    });
    await tx.dailyReconciliation.updateMany({
      where: { agentId, reconciliationDate: request.contribution.collectionDate },
      data: {
        expectedCash: expectedCash._sum.amount ?? 0,
        status: "SUBMITTED",
        reviewedById: null,
        reviewedAt: null,
        reviewNote: "Reopened automatically after an approved payment correction.",
      },
    });
    await tx.contributionCorrectionRequest.update({
      where: { id: request.id },
      data: {
        status: "APPLIED",
        correctedAmount: parsed.data.correctedAmount,
        correctedPaymentMethod: parsed.data.correctedPaymentMethod,
        correctedNote: parsed.data.correctedNote || null,
        appliedAt: now,
      },
    });
    await createAuditLog(tx, {
      actorId: audit.actorId,
      actorRole: audit.actorRole,
      action: "CONTRIBUTION_CORRECTION_APPLIED",
      outcome: "SUCCESS",
      entityType: "Contribution",
      entityId: request.contributionId,
      summary: "Approved payment correction applied and tracking recalculated.",
      metadata: {
        correctionRequestId: request.id,
        originalAmount: Number(request.originalAmount),
        correctedAmount: parsed.data.correctedAmount,
        originalPaymentMethod: request.originalPaymentMethod,
        correctedPaymentMethod: parsed.data.correctedPaymentMethod,
      },
    }, audit);
    return { success: true as const, contributionId: request.contributionId };
    });

    if (!result.success) return fail(result.error);
    return ok({ contributionId: result.contributionId });
  } catch (error) {
    if (error instanceof UnsafeCorrectionError) return fail(error.message);
    throw error;
  }
}
