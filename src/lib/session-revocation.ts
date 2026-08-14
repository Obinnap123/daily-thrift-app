import type { Role } from "@/generated/prisma/client";

export interface SessionSecurityClaims {
  userId: string;
  role: Role;
  sessionVersion: number;
}

interface CurrentAccountSecurityState {
  isActive: boolean;
  role: Role;
  sessionVersion: number;
}

export function parseSessionSecurityClaims(input: {
  id?: unknown;
  role?: unknown;
  sessionVersion?: unknown;
}): SessionSecurityClaims | null {
  const role =
    input.role === "ADMIN" || input.role === "AGENT" || input.role === "CUSTOMER"
      ? input.role
      : null;

  if (
    typeof input.id !== "string" ||
    !input.id ||
    !role ||
    typeof input.sessionVersion !== "number" ||
    !Number.isSafeInteger(input.sessionVersion) ||
    input.sessionVersion < 0
  ) {
    return null;
  }

  return { userId: input.id, role, sessionVersion: input.sessionVersion };
}

export function isSessionSecurityStateCurrent(
  claims: SessionSecurityClaims,
  account: CurrentAccountSecurityState | null,
): boolean {
  return Boolean(
    account?.isActive &&
      account.role === claims.role &&
      account.sessionVersion === claims.sessionVersion,
  );
}
