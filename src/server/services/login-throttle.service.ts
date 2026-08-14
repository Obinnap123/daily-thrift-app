import "server-only";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const IDENTIFIER_FAILURE_LIMIT = 5;
const IP_FAILURE_LIMIT = 25;

type ThrottleScope = "IDENTIFIER" | "IP";

export interface LoginThrottleContext {
  identifierKey: string;
  ipKey: string;
}

export interface LoginThrottleDecision {
  blocked: boolean;
  delayMs: number;
}

function throttleSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("AUTH_SECRET is required for login throttling.");
  return secret;
}

function hashThrottleValue(scope: ThrottleScope, value: string): string {
  return createHmac("sha256", throttleSecret())
    .update(`${scope}\0${value}`)
    .digest("hex");
}

function normalizeIdentifier(identifier: string): string {
  const trimmed = identifier.trim();
  return trimmed.includes("@") ? trimmed.toLowerCase() : normalizePhone(trimmed);
}

function requestIp(request: Request): string {
  const vercelForwarded = request.headers
    .get("x-vercel-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const candidate = vercelForwarded || forwarded || realIp || "unknown";
  return candidate.slice(0, 128);
}

export function createLoginThrottleContext(
  identifier: string,
  request: Request,
): LoginThrottleContext {
  return {
    identifierKey: hashThrottleValue("IDENTIFIER", normalizeIdentifier(identifier)),
    ipKey: hashThrottleValue("IP", requestIp(request)),
  };
}

function progressiveDelay(failedAttempts: number): number {
  if (failedAttempts <= 0) return 0;
  return Math.min(2_000, 250 * 2 ** (failedAttempts - 1));
}

export async function checkLoginThrottle(
  context: LoginThrottleContext,
  now = new Date(),
): Promise<LoginThrottleDecision> {
  const rows = await prisma.loginThrottle.findMany({
    where: { id: { in: [context.identifierKey, context.ipKey] } },
    select: { failedAttempts: true, windowStartedAt: true, lockedUntil: true },
  });

  const windowCutoff = new Date(now.getTime() - WINDOW_MS);
  let highestActiveFailures = 0;
  let blocked = false;

  for (const row of rows) {
    if (row.lockedUntil && row.lockedUntil > now) blocked = true;
    if (row.windowStartedAt > windowCutoff) {
      highestActiveFailures = Math.max(highestActiveFailures, row.failedAttempts);
    }
  }

  return {
    blocked,
    delayMs: blocked ? 2_000 : progressiveDelay(highestActiveFailures),
  };
}

export async function applyLoginDelay(delayMs: number): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function recordLoginFailure(
  context: LoginThrottleContext,
  now = new Date(),
): Promise<void> {
  const windowCutoff = new Date(now.getTime() - WINDOW_MS);
  const retentionCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const lockedUntil = new Date(now.getTime() + LOCK_MS);

  await prisma.$transaction(async (tx) => {
    await tx.loginThrottle.deleteMany({
      where: { updatedAt: { lt: retentionCutoff } },
    });

    // Expired, unlocked windows restart at one. Active windows use atomic
    // increments so concurrent failures cannot overwrite one another.
    await tx.loginThrottle.deleteMany({
      where: {
        id: { in: [context.identifierKey, context.ipKey] },
        windowStartedAt: { lte: windowCutoff },
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
      },
    });

    await tx.loginThrottle.upsert({
      where: { id: context.identifierKey },
      create: {
        id: context.identifierKey,
        scope: "IDENTIFIER",
        failedAttempts: 1,
        windowStartedAt: now,
        lastAttemptAt: now,
      },
      update: { failedAttempts: { increment: 1 }, lastAttemptAt: now },
    });
    await tx.loginThrottle.upsert({
      where: { id: context.ipKey },
      create: {
        id: context.ipKey,
        scope: "IP",
        failedAttempts: 1,
        windowStartedAt: now,
        lastAttemptAt: now,
      },
      update: { failedAttempts: { increment: 1 }, lastAttemptAt: now },
    });

    await tx.loginThrottle.updateMany({
      where: {
        id: context.identifierKey,
        failedAttempts: { gte: IDENTIFIER_FAILURE_LIMIT },
      },
      data: { lockedUntil },
    });
    await tx.loginThrottle.updateMany({
      where: { id: context.ipKey, failedAttempts: { gte: IP_FAILURE_LIMIT } },
      data: { lockedUntil },
    });
  });
}

export async function clearSuccessfulIdentifierThrottle(
  context: LoginThrottleContext,
): Promise<void> {
  // Do not clear the IP bucket: otherwise an attacker could reset a password-
  // spraying counter by successfully signing into an account they control.
  await prisma.loginThrottle.deleteMany({ where: { id: context.identifierKey } });
}
