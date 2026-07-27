/**
 * ContributionPlan business logic.
 * ----------------------------------------------------------------------------
 * Owns the one piece of nontrivial domain logic in this module: computing a
 * plan's savings progress (days paid / missed / remaining, and whether it
 * has now reached COMPLETED) from its Contribution rows — and being the
 * single place that flips a plan from ACTIVE to COMPLETED once the required
 * number of PAID days is reached.
 *
 * Maturity is deliberately PAID-DAY-BASED, not calendar-based: a missed day
 * does not shrink how much the customer saves, it just means one more day
 * of collection is needed before the cycle is done. `expectedMaturityDate`
 * (startDate + durationDays) is stored only as a reference estimate shown to
 * the customer/agent — it is NEVER used to gate payout eligibility.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { toDateOnly, today } from "@/lib/date";
import {
  createContributionPlanSchema,
  type CreateContributionPlanInput,
} from "@/validations/contribution";
import { findActivePlanForCustomer } from "@/server/repositories/contribution-plan.repository";
import { ok, fail, type ActionResult } from "@/lib/action-result";

/** Computed savings-progress snapshot for a single ContributionPlan. */
export interface PlanProgress {
  daysPaid: number;
  daysMissed: number;
  daysRemaining: number;
  totalSaved: number;
  isReadyToComplete: boolean;
}

/**
 * Derive progress numbers for a plan from its own Contribution rows.
 *
 * `daysPaid` counts DISTINCT calendar days with at least one COLLECTED
 * row, not the raw count of COLLECTED rows — this matters since the Quick
 * Pay migration, because an Admin-approved override can add a SECOND
 * COLLECTED row for a day that was already paid (e.g. catching up a missed
 * day with an extra same-day payment). Without this distinction, an
 * override would incorrectly inflate "days paid" by counting one calendar
 * day twice. `totalSaved`, by contrast, IS the sum of every COLLECTED
 * row's amount (including override rows) — the customer's savings balance
 * must reflect every naira actually collected, override or not.
 */
export function computePlanProgress(
  plan: { durationDays: number },
  contributions: { status: "COLLECTED" | "MISSED"; amount: unknown; collectionDate: Date }[]
): PlanProgress {
  const collectedDayKeys = new Set(
    contributions
      .filter((c) => c.status === "COLLECTED")
      .map((c) => c.collectionDate.toISOString().slice(0, 10))
  );
  const daysPaid = collectedDayKeys.size;
  const daysMissed = contributions.filter((c) => c.status === "MISSED").length;
  const daysRemaining = Math.max(0, plan.durationDays - daysPaid);
  const totalSaved = contributions
    .filter((c) => c.status === "COLLECTED")
    .reduce((sum, c) => sum + Number(c.amount ?? 0), 0);

  return {
    daysPaid,
    daysMissed,
    daysRemaining,
    totalSaved,
    isReadyToComplete: daysPaid >= plan.durationDays,
  };
}

/**
 * Start a new savings cycle for a customer. Rejects if the customer already
 * has an ACTIVE plan — only one cycle can be in progress at a time; a new
 * one can only start after the previous one is PAID_OUT.
 */
export async function createContributionPlan(
  input: CreateContributionPlanInput
): Promise<ActionResult<{ contributionPlanId: string }>> {
  const parsed = createContributionPlanSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the highlighted fields.");
  }

  const { customerProfileId, dailyAmount, durationDays, startDate } = parsed.data;

  const existingActive = await findActivePlanForCustomer(customerProfileId);
  if (existingActive) {
    return fail(
      "This customer already has an active savings plan. Complete or pay out the current cycle before starting a new one."
    );
  }

  const start = toDateOnly(startDate);
  const expectedMaturityDate = toDateOnly(
    new Date(start.getTime() + durationDays * 24 * 60 * 60 * 1000)
  );

  const plan = await prisma.contributionPlan.create({
    data: {
      customerProfileId,
      dailyAmount,
      durationDays,
      startDate: start,
      expectedMaturityDate,
    },
  });

  return ok({ contributionPlanId: plan.id });
}

/**
 * Re-check a plan's progress and flip it to COMPLETED if it has now reached
 * its required paid-day count. Called after every recordContribution() —
 * see contribution.service.ts — so a plan's status is always kept in sync
 * with its actual Contribution history rather than drifting.
 */
export async function refreshPlanCompletionStatus(contributionPlanId: string): Promise<void> {
  const plan = await prisma.contributionPlan.findUnique({
    where: { id: contributionPlanId },
    include: { contributions: { select: { status: true, amount: true, collectionDate: true } } },
  });
  if (!plan || plan.status !== "ACTIVE") return;

  const progress = computePlanProgress(plan, plan.contributions);
  if (progress.isReadyToComplete) {
    await prisma.contributionPlan.update({
      where: { id: contributionPlanId },
      data: { status: "COMPLETED" },
    });
  }
}

/** Fetch a customer's active plan (or null) together with its computed progress. */
export async function getActivePlanWithProgress(customerProfileId: string) {
  const plan = await prisma.contributionPlan.findFirst({
    where: { customerProfileId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: { contributions: true },
  });
  if (!plan) return null;

  return { plan, progress: computePlanProgress(plan, plan.contributions), asOf: today() };
}
