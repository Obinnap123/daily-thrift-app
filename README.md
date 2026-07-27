# Davchuks Daily Thrift Management System

## Project Overview
- **Name**: Davchuks Daily Thrift Management System
- **Goal**: Manage a daily contribution/savings (thrift/Ajo-style) business —
  tracking customers, daily contributions collected by field agents, savings
  balances, and withdrawals, with full audit visibility for the admin.
- **Status**: Step 3 complete — Agent Management module (add/edit/
  deactivate/search/paginate agents, bulk-assign customers) and Customer
  Management module (unique customer codes, edit customer, passport photo
  upload, search/filter/paginate customers). Business features (contribution
  recording, savings balance, withdrawals, reports, receipts, notifications,
  backups) are being built incrementally in later steps.

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
- **`User`**: id, name, email (optional, unique — used by Admin/Agent login),
  phone (optional, unique — used by Customer login), passwordHash, role
  (`ADMIN` | `AGENT` | `CUSTOMER`), isActive, lastLoginAt, timestamps.
- **`CustomerProfile`**: one-to-one with a `CUSTOMER`-role `User`. Holds
  idNumber (unique) and assignedAgentId (FK to an `AGENT`-role `User`).
- **`AgentAssignmentLog`**: immutable audit trail. One row per assignment —
  the initial assignment at registration, and every later rotation. Stores
  previousAgentId (nullable), newAgentId, changedById, optional note,
  createdAt.
- **Storage**: PostgreSQL, accessed via Prisma Client (driver-adapter based,
  required by Prisma 7).
- **Auth model**: Stateless JWT sessions (no NextAuth DB session tables).
  Passwords hashed with bcrypt (12 salt rounds). No public self-registration
  for any role — Admins are bootstrapped via the seed script; Agents are
  created by an Admin; Customers are registered by an Admin or their Agent.
- **Dual-identifier login**: a single "identifier" field on the login form.
  Server-side, the value is checked for an "@" — if present, treated as an
  email (Admin/Agent); otherwise normalized as a phone number (Customer).

## Folder Structure
```
src/
  app/
    (auth)/login/                     # Login page + client-side form (identifier + password)
    (dashboard)/admin/                # Admin: overview, agents, customers (list/new/detail)
    (dashboard)/agent/                # Agent: own customers list, register-customer
    (dashboard)/customer/             # Customer: own profile + assigned agent
    api/auth/[...nextauth]/           # NextAuth API route handler
  components/
    ui/                               # Button, Input, Select, Badge, Card
    layout/                           # DashboardHeader, DashboardNav
    providers/                        # SessionProvider
    forms/                            # RegisterCustomerForm, ReassignAgentForm
  server/
    repositories/                     # Prisma queries (agent, customer, user)
    services/                         # Business logic + transactions (agent, customer)
    actions/                          # Server Actions — auth boundary (agent, customer)
  lib/
    prisma.ts                         # Prisma Client singleton (driver-adapter based)
    auth.ts                           # Full NextAuth config (Node runtime, DB access)
    auth.config.ts                    # Edge-safe NextAuth config (used by middleware)
    session.ts                        # getCurrentUser(), requireRole() — server-side authz
    password.ts                       # bcrypt hash/verify helpers
    phone.ts                          # normalizePhone()
    action-result.ts                  # ActionResult<T> discriminated union + ok()/fail()
    utils.ts                          # cn() class merge helper
  validations/
    auth.ts                           # loginSchema, createAgentSchema
    customer.ts                       # registerCustomerSchema, reassignAgentSchema
  types/
    next-auth.d.ts                    # Session/JWT type augmentation (id, role)
  middleware.ts                        # Route protection (auth + role-based section access)
prisma/
  schema.prisma                        # User, CustomerProfile, AgentAssignmentLog
  seed.ts                              # Creates the first Admin account
  migrations/                          # Prisma migration history
```

## User Guide (current state)
1. An Admin account is bootstrapped via the seed script (see "Database Setup"
   below) — there is no public sign-up page by design.
2. Admin logs in at `/login` with **email** + password → lands on `/admin`.
   From there:

   **Agent Management** (`/admin/agents`):
   - Search agents by name/email/phone, filter by Active/Inactive, paginate
     (10 per page).
   - "+ Add Agent" (`/admin/agents/new`) → create an Agent (email + password;
     phone optional).
   - Click "View / Edit" on any row → `/admin/agents/[id]`, where you can:
     - **Edit Agent**: update name/email/phone.
     - **Activate/Deactivate**: toggles login access. Deactivating an agent
       who still has assigned customers shows a confirmation warning first —
       their customers are **not** auto-reassigned (deliberate; do it via
       "Assign Customers" or a customer's own "Rotate Agent").
     - **Assign Customers to This Agent**: pick one or more customers
       currently on other agents (filterable list with checkboxes), add an
       optional reason, and bulk-move them onto this agent in one click.
       Each customer moved gets its own audit-trail entry.
     - See the agent's currently managed customers in a table below.

   **Customer Management** (`/admin/customers`):
   - Search by name/phone/ID number/customer code, filter by Active/Inactive,
     paginate.
   - "+ Register Customer" (`/admin/customers/new`) → register a customer,
     choosing any active agent. A unique **customer code** (e.g.
     `DDT-000123`) is generated automatically and shown in the success toast.
   - Click "View" on any row → `/admin/customers/[id]`, where you can:
     - See the profile summary (customer code, ID number, registration date,
       current agent).
     - **Edit Customer**: update name/phone/ID number.
     - **Passport Photo**: upload or replace the customer's photo (JPEG/PNG/
       WEBP, max 5MB) — shows a live preview before saving.
     - **Rotate Agent**: reassign this one customer to a different agent
       (with an optional note) — separate from the bulk "Assign Customers"
       flow above; both write to the same audit trail.
     - See the full agent-assignment history (audit trail) at the bottom.
3. Agent logs in at `/login` with **email** + password → lands on `/agent`,
   which lists **only their own** assigned customers. "+ Register Customer"
   registers a new customer that is automatically assigned to themselves —
   there is no way for an Agent to pick a different agent, even by tampering
   with the request (enforced server-side, see Security Notes).
4. Customer logs in at `/login` with **phone number** + password → lands on
   `/customer`, showing their own profile and their currently assigned agent's
   name/contact. Savings balance / transaction history will appear here in a
   later step.
5. "Sign out" in the dashboard header ends the session for any role.

## Database Setup (local/sandbox development)
```bash
# 1. Apply migrations to PostgreSQL
npx prisma migrate deploy

# 2. Seed the first Admin account (reads from env vars, with safe fallbacks)
SEED_ADMIN_EMAIL="admin@davchuks.com" \
SEED_ADMIN_PASSWORD="YourStrongPassword123" \
SEED_ADMIN_NAME="System Administrator" \
npm run db:seed
```

## Development
```bash
npm run build                    # Build the production bundle
pm2 restart webapp --update-env  # Restart via PM2 after a new build
pm2 logs webapp --nostream       # Check logs without blocking
```

## Features Implemented (Step 1 + Step 2)
- ✅ Next.js + TypeScript + Tailwind CSS project scaffolded
- ✅ PostgreSQL + Prisma ORM (Prisma 7 driver-adapter pattern)
- ✅ `User`, `CustomerProfile`, `AgentAssignmentLog` models + migration
- ✅ NextAuth v5 Credentials auth — dual identifier (email for Admin/Agent,
  phone for Customer), bcrypt hashing, JWT sessions
- ✅ Role-based route middleware (coarse section blocking) **+**
  `requireRole()` server-side re-verification (fine-grained, per page/action)
- ✅ Admin: Agents list/create, Customers list/create/detail, agent
  reassignment (rotation) with full audit history
- ✅ Agent: own-customers-only dashboard, self-scoped customer registration
  (server-enforced — the client can never pick a different agent)
- ✅ Customer: own-profile dashboard (name, phone, ID number, status,
  assigned agent) — scoped strictly to the logged-in user's own record
- ✅ Repository / Service / Server-Action three-layer architecture with
  transactional writes (`registerCustomer`, `reassignCustomerAgent`)
- ✅ Zod validation shared client+server; friendly `ActionResult` error
  shape (no raw exceptions reaching the UI); loading states on all forms
- ✅ Verified end-to-end: `npm run build` succeeds; PM2 restarted on new
  build; Admin login verified via curl (session cookie + `/admin` 200 +
  `/agent` correctly redirected by middleware).

## Features Not Yet Implemented (upcoming steps)
1. Daily Contribution Recording (agent records collections per customer)
2. Savings Balance calculation & display
3. Withdrawals (request + approval workflow)
4. Reports (collection summaries, agent performance, customer statements)
5. Receipt Generation (PDF/printable receipts)
6. Full User Management (edit/disable Agents & Customers, password resets)
7. Audit Logs (system-wide — beyond the agent-assignment log already built)
8. Notifications (email/SMS reminders, alerts)
9. Backup and Restore

## Deployment Notes
⚠️ This stack (Next.js + Prisma + PostgreSQL + NextAuth, Node.js runtime) is
**not compatible with this platform's one-click Cloudflare Pages deploy**,
which is built for the Hono/Workers edge runtime. When ready to deploy to
production, we'll need a Node-friendly host such as Railway, Render, Fly.io,
a VPS, or Vercel + a managed PostgreSQL provider (Neon, Supabase, RDS, etc.).

## Security Notes
- Passwords are hashed with bcrypt (12 salt rounds), never stored in plain text.
- `.env` (real secrets) is git-ignored; `.env.example` documents required vars.
- Sessions use signed JWTs (`AUTH_SECRET`).
- Login errors are generic ("Invalid credentials...") to avoid leaking
  whether an identifier exists in the system.
- Disabled accounts (`isActive = false`) cannot log in even with correct credentials.
- `trustHost: true` is required because the app runs behind a reverse proxy.
- **Defense-in-depth authorization** (three independent layers, never trusting
  the client alone):
  1. Middleware blocks a request from a wrong-role dashboard *URL section*.
  2. `requireRole()` re-verifies the caller's role from the signed JWT inside
     every Server Component page and every Server Action.
  3. Data-access queries are scoped at the database level (e.g.
     `listCustomerProfiles({ agentId })`), and the Agent's own id is taken
     **only** from the verified session — `registerCustomerAction` forcibly
     overrides any `assignedAgentId` the client form sends when the caller
     is an Agent, so an Agent cannot register a customer under anyone else.
- Nullable-unique `email`/`phone` columns are safe in Postgres: a unique
  constraint permits multiple `NULL`s, so many phoneless Agents and many
  emailless Customers can coexist.
