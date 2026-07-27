/**
 * Prisma Client Singleton
 * ----------------------------------------------------------------------------
 * Next.js reloads modules frequently in development (hot reload), which would
 * normally create a brand-new PrismaClient (and therefore a new DB connection
 * pool) on every reload — quickly exhausting PostgreSQL's connection limit.
 *
 * To prevent this, we cache a single PrismaClient instance on the Node.js
 * `global` object in development, and always create a fresh one in
 * production (where the module is only loaded once per server instance).
 *
 * Prisma 7 requires an explicit driver adapter (no more implicit engine
 * connecting straight from the `url` in schema.prisma), so we wire up the
 * `@prisma/adapter-pg` adapter using node-postgres (`pg`) under the hood.
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

  return new PrismaClient({
    adapter,
    // Log slow/error queries in development for easier debugging.
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
