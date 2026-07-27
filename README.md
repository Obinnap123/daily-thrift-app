# Davchuks Daily Thrift Management System

## Project Overview
- **Name**: Davchuks Daily Thrift Management System
- **Goal**: Manage a daily contribution/savings (thrift/Ajo-style) business —
  tracking customers, daily contributions collected by field agents, savings
  balances, and withdrawals, with full audit visibility for the admin.
- **Status**: Step 1 complete (project setup, auth, role-based dashboards).
  Business features (registration, contributions, withdrawals, reports,
  receipts, audit logs, notifications, backups) are being built incrementally
  in later steps.

## Tech Stack
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Styling**: Tailwind CSS 4
- **Database**: PostgreSQL 17
- **ORM**: Prisma 7 (with `@prisma/adapter-pg` driver adapter)
- **Auth**: NextAuth v5 (Auth.js) — Credentials provider, JWT sessions
- **Validation**: Zod + react-hook-form
- **Process manager (dev/sandbox)**: PM2

## URLs
- **Local/sandbox dev**: http://localhost:3000
- **Production**: _not yet deployed_ — see "Deployment" note below.

## Data Architecture
- **Data Models** (so far): `User` (id, name, email, passwordHash, role,
  phone, isActive, lastLoginAt, timestamps). `Role` enum: `ADMIN`, `AGENT`,
  `CUSTOMER`.
- **Storage**: PostgreSQL, accessed via Prisma Client (driver-adapter based,
  required by Prisma 7).
- **Auth model**: Stateless JWT sessions (no NextAuth DB session tables).
  Passwords hashed with bcrypt (12 salt rounds). No public self-registration —
  accounts are created by an Admin (seed script creates the first Admin).

## Folder Structure
```
src/
  app/
    (auth)/login/            # Login page + client-side form
    (dashboard)/admin/       # Admin dashboard (placeholder for Step 1)
    (dashboard)/agent/       # Agent dashboard (placeholder for Step 1)
    (dashboard)/customer/    # Customer dashboard (placeholder for Step 1)
    api/auth/[...nextauth]/  # NextAuth API route handler
  components/
    ui/                      # Reusable primitives (Button, Input, Card)
    layout/                  # Shared layout pieces (DashboardHeader)
    providers/               # Client-side context providers (SessionProvider)
    forms/                   # (reserved for future form components)
  server/
    services/                # (reserved for business logic, Step 2+)
    repositories/            # (reserved for data-access layer, Step 2+)
  lib/
    prisma.ts                # Prisma Client singleton (driver-adapter based)
    auth.ts                  # Full NextAuth config (Node runtime, has DB access)
    auth.config.ts           # Edge-safe NextAuth config (used by middleware)
    password.ts              # bcrypt hash/verify helpers
    utils.ts                 # Small shared helpers (cn() class merge)
  validations/
    auth.ts                  # Zod schemas for login/register
  types/
    next-auth.d.ts           # Session/JWT type augmentation (id, role)
  middleware.ts               # Route protection (auth + role-based access)
prisma/
  schema.prisma               # Database schema
  seed.ts                     # Creates the first Admin account
  migrations/                 # Prisma migration history
```

## User Guide (current state)
1. An Admin account is bootstrapped via the seed script (see "Database setup"
   below) — there is no public sign-up page by design.
2. Visit `/login` and sign in with the Admin's email/password.
3. On success you're redirected to `/admin`, `/agent`, or `/customer`
   depending on the account's role. Middleware blocks cross-role access
   (e.g. a Customer cannot browse to `/admin`).
4. Use "Sign out" in the dashboard header to end the session.

## Database Setup (local/sandbox development)
```bash
# 1. Apply the schema to PostgreSQL
npm run db:migrate

# 2. Seed the first Admin account (reads from env vars, with safe fallbacks)
SEED_ADMIN_EMAIL="admin@davchuks.com" \
SEED_ADMIN_PASSWORD="YourStrongPassword123" \
SEED_ADMIN_NAME="System Administrator" \
npm run db:seed
```

## Development
```bash
npm run build            # Build the production bundle
pm2 start ecosystem.config.cjs   # Start via PM2 (see Standard Startup Workflow)
pm2 logs webapp --nostream       # Check logs without blocking
```

## Features Implemented (Step 1)
- ✅ Next.js + TypeScript + Tailwind CSS project scaffolded
- ✅ PostgreSQL database + Prisma ORM configured (Prisma 7 driver-adapter pattern)
- ✅ `User` model with role enum (ADMIN / AGENT / CUSTOMER)
- ✅ NextAuth v5 Credentials authentication (bcrypt password hashing, JWT sessions)
- ✅ Role-based route protection middleware
- ✅ Login page with client-side + server-side (Zod) validation
- ✅ Placeholder dashboards for all three roles
- ✅ Reusable UI primitives (Button, Input, Card)
- ✅ Seed script for bootstrapping the first Admin account
- ✅ Verified end-to-end: build succeeds, login succeeds/fails correctly,
  sessions carry custom fields, role-based access enforced, tested both on
  localhost and through the public sandbox URL.

## Features Not Yet Implemented (upcoming steps)
1. Customer Registration (full customer profile + KYC fields)
2. Daily Contribution Recording (agent records collections per customer)
3. Savings Balance calculation & display
4. Withdrawals (request + approval workflow)
5. Reports (collection summaries, agent performance, customer statements)
6. Receipt Generation (PDF/printable receipts)
7. User Management (Admin creates/edits/disables Agents & Customers)
8. Audit Logs (who did what, when)
9. Notifications (email/SMS reminders, alerts)
10. Backup and Restore

## Deployment Notes
⚠️ This stack (Next.js + Prisma + PostgreSQL + NextAuth, Node.js runtime) is
**not compatible with this platform's one-click Cloudflare Pages deploy**,
which is built for the Hono/Workers edge runtime. When ready to deploy to
production, we'll need a Node-friendly host such as Railway, Render, Fly.io,
a VPS, or Vercel + a managed PostgreSQL provider (Neon, Supabase, RDS, etc.).

## Security Notes
- Passwords are hashed with bcrypt (12 salt rounds), never stored in plain text.
- `.env` (real secrets) is git-ignored; `.env.example` documents required vars.
- Sessions use signed JWTs (`AUTH_SECRET`), 8-hour expiry.
- Login errors are generic ("Invalid email or password") to avoid leaking
  whether an email exists in the system.
- Disabled accounts (`isActive = false`) cannot log in even with correct credentials.
- `trustHost: true` is required because the app runs behind a reverse proxy
  (this sandbox, and most production hosts) — Auth.js infers the real host
  from forwarded headers rather than relying on a hardcoded `NEXTAUTH_URL`.
