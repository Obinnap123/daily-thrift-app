/** One-time, explicit promotion after the SUPER_ADMIN schema and app are deployed. */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const confirmation = process.argv.includes("--confirm");

if (!email || !confirmation) {
  console.error("Set SEED_ADMIN_EMAIL and pass --confirm to promote that exact account.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL }) });
try {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(392541, 1)::text`;
    const account = await tx.user.findUnique({ where: { email }, select: { id: true, role: true, isActive: true, emailVerifiedAt: true } });
    if (!account || !account.isActive || !account.emailVerifiedAt) throw new Error("The seeded account is missing, inactive, or unverified.");
    if (account.role === "SUPER_ADMIN") return "already-promoted";
    if (account.role !== "ADMIN") throw new Error("The seeded account is not an Admin.");
    const other = await tx.user.findFirst({ where: { role: "SUPER_ADMIN", isActive: true }, select: { id: true } });
    if (other) throw new Error("An active Super Admin already exists.");
    await tx.user.update({ where: { id: account.id }, data: { role: "SUPER_ADMIN", sessionVersion: { increment: 1 } } });
    await tx.auditLog.create({ data: { actorId: account.id, actorRole: "SUPER_ADMIN", action: "SEEDED_ADMIN_PROMOTED", outcome: "SUCCESS", entityType: "User", entityId: account.id, summary: "Existing Admin account promoted to Super Admin. Historical audit roles remain unchanged." } });
    return "promoted";
  }, { isolationLevel: "Serializable" });
  console.log(result === "promoted" ? "Seeded account promoted. Sign in again through Admin login." : "Seeded account was already promoted.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Promotion failed.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
