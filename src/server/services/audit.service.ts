import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { AuditOutcome, Role } from "@/generated/prisma/client";

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
/** Audit logging must never make the primary business action fail. */
export async function writeAuditLog(event: AuditEvent): Promise<void> {
  try {
    const requestHeaders = await headers();
    const forwarded = requestHeaders.get("x-forwarded-for");
    await prisma.auditLog.create({
      data: {
        ...event,
        metadata: event.metadata,
        ipAddress: forwarded?.split(",")[0]?.trim() ?? requestHeaders.get("x-real-ip"),
        userAgent: requestHeaders.get("user-agent")?.slice(0, 500),
      },
    });
  } catch (error) {
    console.error("Audit log write failed", error);
  }
}
