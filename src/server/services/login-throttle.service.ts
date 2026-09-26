import "server-only";
import { normalizePhone } from "@/lib/phone";
import {
  checkSecurityThrottle,
  clearSecurityThrottle,
  createSecurityThrottleBucket,
  recordSecurityThrottleFailure,
} from "@/server/services/security-throttle.service";

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const IDENTIFIER_FAILURE_LIMIT = 5;
const IP_FAILURE_LIMIT = 25;

export interface LoginThrottleContext {
  identifierKey: string;
  ipKey: string;
}

export interface LoginThrottleDecision {
  blocked: boolean;
  delayMs: number;
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
    identifierKey: createSecurityThrottleBucket("IDENTIFIER", normalizeIdentifier(identifier), IDENTIFIER_FAILURE_LIMIT).id,
    ipKey: createSecurityThrottleBucket("IP", requestIp(request), IP_FAILURE_LIMIT).id,
  };
}

export async function checkLoginThrottle(
  context: LoginThrottleContext,
  now = new Date(),
): Promise<LoginThrottleDecision> {
  return checkSecurityThrottle([
    { id: context.identifierKey, scope: "IDENTIFIER", failureLimit: IDENTIFIER_FAILURE_LIMIT },
    { id: context.ipKey, scope: "IP", failureLimit: IP_FAILURE_LIMIT },
  ], { windowMs: WINDOW_MS, maximumDelayMs: 2_000 }, now);
}

export async function applyLoginDelay(delayMs: number): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function recordLoginFailure(
  context: LoginThrottleContext,
  now = new Date(),
): Promise<void> {
  await recordSecurityThrottleFailure([
    { id: context.identifierKey, scope: "IDENTIFIER", failureLimit: IDENTIFIER_FAILURE_LIMIT },
    { id: context.ipKey, scope: "IP", failureLimit: IP_FAILURE_LIMIT },
  ], {
    windowMs: WINDOW_MS,
    lockMs: LOCK_MS,
    retentionMs: 24 * 60 * 60 * 1000,
  }, now);
}

export async function clearSuccessfulIdentifierThrottle(
  context: LoginThrottleContext,
): Promise<void> {
  // Do not clear the IP bucket: otherwise an attacker could reset a password-
  // spraying counter by successfully signing into an account they control.
  await clearSecurityThrottle([
    { id: context.identifierKey, scope: "IDENTIFIER", failureLimit: IDENTIFIER_FAILURE_LIMIT },
  ]);
}
