import { createHash, randomBytes } from "node:crypto";

const INVITATION_LIFETIME_MS = 48 * 60 * 60 * 1000;

export function hashStaffVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createStaffVerificationToken(now: Date = new Date()) {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashStaffVerificationToken(token),
    expiresAt: new Date(now.getTime() + INVITATION_LIFETIME_MS),
  };
}
