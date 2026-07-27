/**
 * Password hashing utilities
 * ----------------------------------------------------------------------------
 * Centralizes password hashing/verification so the same algorithm and cost
 * factor are used everywhere (registration, seed scripts, password resets).
 *
 * We use bcryptjs (pure JS implementation, no native build step required —
 * important for portability across deploy targets).
 */
import bcrypt from "bcryptjs";

/** Number of bcrypt salt rounds. 12 is a strong, production-appropriate cost. */
const SALT_ROUNDS = 12;

/** Hash a plain-text password before storing it in the database. */
export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

/** Compare a plain-text password against a stored bcrypt hash. */
export async function verifyPassword(
  plainTextPassword: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(plainTextPassword, passwordHash);
}
