import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { AuditOutcome, Prisma, Role } from "@/generated/prisma/client";

export interface AuditEvent {
  actorId?: string | null;
  actorRole?: Role | null;
  action: string;
  outcome: AuditOutcome;
  entityType?: string;
  entityId?: string;
  summary: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface AuditRequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditActorContext extends AuditRequestContext {
  actorId: string;
  actorRole: Role;
}

/** Capture request data before entering a transaction or deferred callback. */
export async function getAuditRequestContext(): Promise<AuditRequestContext> {
  const requestHeaders = await headers();
  const forwarded =
    requestHeaders.get("x-vercel-forwarded-for") ??
    requestHeaders.get("x-forwarded-for");
  return {
    ipAddress: forwarded?.split(",")[0]?.trim() ?? requestHeaders.get("x-real-ip"),
    userAgent: requestHeaders.get("user-agent")?.slice(0, 500) ?? null,
  };
}

/**
 * Strict audit insert for business transactions. This intentionally does not
 * catch errors: if the insert fails, the surrounding mutation must roll back.
 */
export async function createAuditLog(
  tx: Prisma.TransactionClient,
  event: AuditEvent,
  context: AuditRequestContext,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      ...event,
      metadata: event.metadata,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  });
}

/** Required audit outside a business mutation, primarily for failed attempts. */
export async function writeRequiredAuditLog(
  event: AuditEvent,
  context: AuditRequestContext,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      ...event,
      metadata: event.metadata,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  });
}

/** Audit logging must never make the primary business action fail. */
export async function writeAuditLog(
  event: AuditEvent,
  suppliedContext?: AuditRequestContext,
): Promise<void> {
  try {
    const context = suppliedContext ?? await getAuditRequestContext();
    await prisma.auditLog.create({
      data: {
        ...event,
        metadata: event.metadata,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  } catch (error) {
    console.error("Audit log write failed", error);
  }
}
