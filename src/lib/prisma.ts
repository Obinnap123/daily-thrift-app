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
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    // Supabase session mode currently allows 15 clients. Keep this process's
    // pool deliberately small so Next.js workers/reloads cannot consume the
    // entire allowance. Queries wait briefly for a pooled connection instead
    // of opening up to node-postgres's default of ten per process.
    max: 3,
    // Supabase's shared pooler can queue briefly during local hot reloads.
    // Five seconds proved too short for the dashboard's parallel query burst;
    // 30 seconds keeps failures bounded without rejecting healthy queued work.
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 10_000,
    maxLifetimeSeconds: 60,
    application_name: "davchuks-daily-thrift",
  });

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
