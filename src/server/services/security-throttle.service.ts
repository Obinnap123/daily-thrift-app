import "server-only";

import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";

export interface SecurityThrottleBucket {
  id: string;
  scope: string;
  failureLimit: number;
}

interface SecurityThrottlePolicy {
  windowMs: number;
  lockMs: number;
  retentionMs: number;
  maximumDelayMs?: number;
}

function throttleSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("AUTH_SECRET is required for request throttling.");
  return secret;
}

export function createSecurityThrottleBucket(
  scope: string,
  value: string,
  failureLimit: number,
): SecurityThrottleBucket {
  return {
    id: createHmac("sha256", throttleSecret())
      .update(`${scope}\0${value}`)
      .digest("hex"),
    scope,
    failureLimit,
  };
}

export async function checkSecurityThrottle(
  buckets: SecurityThrottleBucket[],
  policy: Pick<SecurityThrottlePolicy, "windowMs" | "maximumDelayMs">,
  now = new Date(),
): Promise<{ blocked: boolean; delayMs: number }> {
  if (buckets.length === 0) return { blocked: false, delayMs: 0 };

  const rows = await prisma.loginThrottle.findMany({
    where: { id: { in: buckets.map((bucket) => bucket.id) } },
    select: { failedAttempts: true, windowStartedAt: true, lockedUntil: true },
  });
  const windowCutoff = new Date(now.getTime() - policy.windowMs);
  let highestActiveFailures = 0;
  let blocked = false;

  for (const row of rows) {
    if (row.lockedUntil && row.lockedUntil > now) blocked = true;
    if (row.windowStartedAt > windowCutoff) {
      highestActiveFailures = Math.max(highestActiveFailures, row.failedAttempts);
    }
  }

  const maximumDelayMs = policy.maximumDelayMs ?? 2_000;
  const delayMs = highestActiveFailures <= 0
    ? 0
    : Math.min(maximumDelayMs, 250 * 2 ** (highestActiveFailures - 1));
  return { blocked, delayMs: blocked ? maximumDelayMs : delayMs };
}

export async function recordSecurityThrottleFailure(
  buckets: SecurityThrottleBucket[],
  policy: SecurityThrottlePolicy,
  now = new Date(),
): Promise<void> {
  if (buckets.length === 0) return;

  const windowCutoff = new Date(now.getTime() - policy.windowMs);
  const retentionCutoff = new Date(now.getTime() - policy.retentionMs);
  const lockedUntil = new Date(now.getTime() + policy.lockMs);
  const ids = buckets.map((bucket) => bucket.id);

  await prisma.$transaction(async (tx) => {
    await tx.loginThrottle.deleteMany({
      where: { scope: { in: [...new Set(buckets.map((bucket) => bucket.scope))] }, updatedAt: { lt: retentionCutoff } },
    });
    await tx.loginThrottle.deleteMany({
      where: {
        id: { in: ids },
        windowStartedAt: { lte: windowCutoff },
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
      },
    });

    for (const bucket of buckets) {
      await tx.loginThrottle.upsert({
        where: { id: bucket.id },
        create: {
          id: bucket.id,
          scope: bucket.scope,
          failedAttempts: 1,
          windowStartedAt: now,
          lastAttemptAt: now,
        },
        update: { failedAttempts: { increment: 1 }, lastAttemptAt: now },
      });
      await tx.loginThrottle.updateMany({
        where: { id: bucket.id, failedAttempts: { gte: bucket.failureLimit } },
        data: { lockedUntil },
      });
    }
  });
}

export async function clearSecurityThrottle(
  buckets: SecurityThrottleBucket[],
): Promise<void> {
  if (buckets.length === 0) return;
  await prisma.loginThrottle.deleteMany({
    where: { id: { in: buckets.map((bucket) => bucket.id) } },
  });
}

export async function applySecurityThrottleDelay(delayMs: number): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
