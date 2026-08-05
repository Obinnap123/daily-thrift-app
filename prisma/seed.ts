/**
 * Database seed script.
 * ----------------------------------------------------------------------------
 * Creates the very first Admin account so someone can log in and start
 * using the system (there is intentionally no public self-registration
 * page — accounts are created by an Admin from inside the app in later
 * steps).
 *
 * Run with: npm run db:seed
 *
 * Requires credentials from environment variables so the initial admin
 * password is never hardcoded in source control or printed to logs:
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = requiredEnv("SEED_ADMIN_EMAIL");
  const password = requiredEnv("SEED_ADMIN_PASSWORD");
  const name = requiredEnv("SEED_ADMIN_NAME");

  const existingAdmin = await prisma.user.findUnique({ where: { email } });
  if (existingAdmin) {
    console.log(`Admin account already exists for ${email}. Skipping.`);
    return;
  }

  const passwordHash = await hashPassword(password);

  const admin = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: "ADMIN",
    },
  });

  console.log("----------------------------------------------------------");
  console.log("✅ Admin account created:");
  console.log(`   Email:    ${admin.email}`);
  console.log("   Password: stored securely in the seed environment");
  console.log("----------------------------------------------------------");
}

function requiredEnv(name: "SEED_ADMIN_EMAIL" | "SEED_ADMIN_PASSWORD" | "SEED_ADMIN_NAME") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set before running the database seed.`);
  return value;
}

main()
  .catch((error) => {
    console.error("Seed script failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
