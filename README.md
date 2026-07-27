# Davchuks Daily Thrift Management System

## Project Overview
- **Name**: Davchuks Daily Thrift Management System
- **Goal**: Manage a daily contribution/savings (thrift/Ajo-style) business —
  tracking customers, daily contributions collected by field agents, savings
  progress toward maturity, and manual (cash/bank) payouts at maturity, with
  full audit visibility and reporting for the admin. There is **no online
  payment integration** anywhere in this system — all money movement (both
  collection and payout) happens in person and is only *recorded* here.
- **Status**: Step 4 complete — the full contribution → savings → payout
  lifecycle is now live, on top of Steps 1-3 (auth, Agent Management,
  Customer Management). Note: an earlier design considered a "Withdrawal"
  module; this was replaced entirely by the **Payout module** below (savings
  are only released at maturity, via an admin-approved, receipted payout —
  not an ad hoc withdrawal).

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
- **`ContributionPlan`**: one active plan per customer at a time. Stores the
  dailyAmount, planDurationDays (paid-day-based maturity target — not
  calendar days, since customers can miss days), startDate, status
  (`ACTIVE` | `MATURED` | `PAID_OUT`), and denormalized progress fields
  (`paidDaysCount`, `totalSavings`) that are updated transactionally whenever
  a `Contribution` is recorded.
- **`Contribution`**: one row per **day per plan** (unique constraint
  prevents double-recording the same day). Stores amount, status
  (`COLLECTED` | `MISSED`), the contribution date (server-enforced "today" —
  never client-supplied), and a denormalized `customerProfileId` for fast
  per-customer/per-agent report queries without joining through the plan.
- **`DailyReconciliation`**: one row per agent per day. Agent submits
  expectedCash (a snapshot computed from that day's collections) vs.
  actualCash physically handed in, plus an optional note; status starts
  `SUBMITTED` and an Admin transitions it to `APPROVED` or `REJECTED`
  (`reviewedById`, `reviewedAt`, optional `adminNote` recorded on review).
- **`Payout`**: created transactionally as the single "mark this plan as
  Paid" operation. Stores a unique `receiptNumber`, the `totalSavings`
  snapshot at payout time, `method` (`CASH` | `BANK_TRANSFER`), `payoutDate`,
  `approvedById` (who authorized it), and a denormalized `customerProfileId`.
  Creating a Payout also flips its `ContributionPlan.status` to `PAID_OUT` in
  the same transaction — this is the *only* way a plan becomes Paid.
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
    (dashboard)/admin/                # Admin: overview, agents, customers, payouts,
                                       #   reconciliations, reports (list/new/detail pages)
    (dashboard)/agent/                # Agent: own customers, collections, reconciliation
    (dashboard)/customer/             # Customer: own profile + savings progress + payouts
    api/auth/[...nextauth]/           # NextAuth API route handler
    api/reports/export/               # GET route handler — PDF/Excel report download
  components/
    ui/                               # Button, Input, Select, Badge, Card
    layout/                           # DashboardHeader, DashboardNav
    providers/                        # SessionProvider
    dashboard/                        # MonthlyTrackerGrid (31-Day Tracking, shared
                                       #   by Admin + Agent dashboards)
    forms/                            # RegisterCustomerForm, ReassignAgentForm,
                                       #   CreatePlanForm, RecordContributionForm,
                                       #   SubmitReconciliationForm, ReviewReconciliationButtons,
                                       #   RecordPayoutForm, PayoutRow, PrintButton,
                                       #   ReportFilterForm, ExportButtons
  server/
    repositories/                     # Prisma queries (agent, customer, user,
                                       #   contribution-plan, contribution, reconciliation, payout)
    services/                        # Business logic + transactions, incl. contribution-plan,
                                       #   contribution, reconciliation, payout
    actions/                          # Server Actions — auth boundary (agent, customer,
                                       #   contribution, reconciliation, payout)
  lib/
    prisma.ts                         # Prisma Client singleton (driver-adapter based)
    auth.ts                           # Full NextAuth config (Node runtime, DB access)
    auth.config.ts                    # Edge-safe NextAuth config (used by middleware)
    session.ts                        # getCurrentUser(), requireRole() — server-side authz
    password.ts                       # bcrypt hash/verify helpers
    phone.ts                          # normalizePhone()
    date.ts                           # today(), toDateOnly(), week/month range helpers
    receipt-number.ts                 # Unique payout receipt number generator
    action-result.ts                  # ActionResult<T> discriminated union + ok()/fail()
    utils.ts                          # cn() class merge helper
    reports/
      build-report.ts                 # buildReportTable() — shared by on-screen page + export
      pdf.ts                          # renderReportToPdfBuffer() via pdf-lib
      xlsx.ts                         # renderReportToExcelBuffer() via exceljs
  validations/
    auth.ts                           # loginSchema, createAgentSchema
    customer.ts                       # registerCustomerSchema, reassignAgentSchema
    contribution.ts                   # createContributionPlanSchema, recordContributionSchema
    reconciliation.ts                 # submitReconciliationSchema, reviewReconciliationSchema
    payout.ts                         # recordPayoutSchema
  types/
    next-auth.d.ts                    # Session/JWT type augmentation (id, role)
  middleware.ts                        # Route protection (auth + role-based section access)
prisma/
  schema.prisma                        # User, CustomerProfile, AgentAssignmentLog,
                                        #   ContributionPlan, Contribution,
                                        #   DailyReconciliation, Payout
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
   `/customer`, showing their own profile, assigned agent, a **Savings
   Progress** card (daily amount, paid days / target days, total saved,
   projected maturity date, status), and their **Payout History**.
5. "Sign out" in the dashboard header ends the session for any role.

### Agent Collection workflow (`/agent`, `/agent/collections`, `/agent/reconciliation`)
- `/agent` (**Agent Collection Summary**): 9 at-a-glance metrics for the
  logged-in agent — total customers, active plans, collections
  today/this-week/this-month, missed payments today, customers due for
  payout, today's reconciliation status, and last submission date.
- `/agent/collections` (**Today's Collections**): every customer with an
  active plan, with an inline `RecordContributionForm` to record that day's
  collection (amount pre-filled from the plan's daily amount; server
  enforces "today" and a one-row-per-day-per-plan uniqueness constraint —
  an agent cannot double-record or backdate a collection).
- `/agent/reconciliation` (**End-of-Day Reconciliation**): shows a
  `SubmitReconciliationForm` (expected cash, from that day's actual
  collections, vs. actual cash handed in + optional note) if today's report
  hasn't been submitted yet; otherwise shows a read-only summary with a
  status badge (`SUBMITTED` / `APPROVED` / `REJECTED`) plus history of past
  reconciliations.
- `/agent` also shows a **31-Day Tracking** grid (`MonthlyTrackerGrid`) of
  this agent's own collection activity for the most recent 31 days — one
  cell per calendar day, colored emerald (collected), red (missed), or gray
  (no activity), with today's cell ring-highlighted.

### Admin oversight (`/admin`, `/admin/reconciliations`, `/admin/payouts`, `/admin/reports`)
- `/admin` (**Admin Dashboard**): 10 metrics/feeds — total & active
  customers, total agents, missed payments today, collections
  today/this-week/this-month, customers due for payout, plus two live feeds
  (Recent Transactions, Recent Agent Activities) and Quick Actions shortcuts,
  plus a system-wide **31-Day Tracking** grid (same `MonthlyTrackerGrid`
  component as the Agent dashboard, but aggregated across every agent).
- `/admin/reconciliations` (**Reconciliation review queue**): filterable by
  status (Submitted/Approved/Rejected/All); Admin approves or rejects each
  `SUBMITTED` row via `ReviewReconciliationButtons` (optional note on
  rejection), paginated.
- `/admin/payouts` (**Payout module**): a "Ready for Payout" section (plans
  that have reached their target paid-days count) with an inline expandable
  `RecordPayoutForm` per customer — captures payout method (Cash / Bank
  Transfer), payment date, and records the approving admin automatically
  from the session. Submitting generates a unique receipt number, marks the
  plan `PAID_OUT` (transactional), and redirects to a **printable payout
  receipt** page (`/admin/payouts/[receiptNumber]`, with a `PrintButton` and
  print-only CSS that hides the dashboard chrome). A "Payout History"
  section below lists every payout ever made, paginated.
- `/admin/reports` (**Reports**): one page covering all six report types —
  **Daily / Weekly / Monthly / Agent / Customer / Payout History**. The
  report type and its scope (anchor date, agent, customer search, or an
  optional date range) are chosen via `ReportFilterForm`, a plain GET form —
  every report configuration is therefore a shareable URL, e.g.
  `/admin/reports?type=agent&agentId=...&start=...&end=...`. The on-screen
  table and the downloadable file are built from the exact same
  `buildReportTable()` function, so what you see always matches what you
  export. Use the **Export PDF** / **Export Excel** buttons (top-right of
  the report card) to download — these call
  `GET /api/reports/export?type=...&format=pdf|excel&...` directly (no
  client-side JS involved; the browser downloads the file because of the
  `Content-Disposition: attachment` response header).

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

## Report & Export API
- `GET /admin/reports?type=daily|weekly|monthly|agent|customer|payout&date=YYYY-MM-DD&start=YYYY-MM-DD&end=YYYY-MM-DD&agentId=...&customerSearch=...`
  — the on-screen Reports page (Admin-only; enforced by `requireRole("ADMIN")`
  inside the Server Component, in addition to the middleware's coarse
  `/admin/*` route block).
- `GET /api/reports/export?type=...&format=pdf|excel&...` (same scope params
  as above) — downloads the identical report as a `.pdf` or `.xlsx` file.
  Admin-only, re-checked directly via `auth()` inside the route handler
  (this endpoint sits outside `/admin/*`, so middleware alone wouldn't cover
  it). Implemented as a Route Handler (not a Server Action) because only a
  Route Handler can return a raw binary `Response` with a
  `Content-Disposition: attachment` header.

## Features Implemented (Steps 1-4)
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
- ✅ Customer: own-profile dashboard, scoped strictly to the logged-in
  user's own record
- ✅ Repository / Service / Server-Action three-layer architecture with
  transactional writes throughout
- ✅ Zod validation shared client+server; friendly `ActionResult` error
  shape (no raw exceptions reaching the UI); loading states on all forms
- ✅ **Daily Contribution Recording** — `ContributionPlan` + `Contribution`
  models, one-row-per-day-per-plan uniqueness, server-enforced "today",
  agent-facing `/agent/collections` page
- ✅ **Savings Progress** — paid-day-based maturity tracking (not calendar
  days), denormalized running totals kept in sync transactionally on every
  contribution, customer-facing progress card (7 fields)
- ✅ **Maturity/Payout module** (replaces the earlier "Withdrawal" concept
  entirely) — ready-for-payout list, payout method (Cash/Bank Transfer),
  payment date, recorded approver, unique receipt number, printable receipt
  page, transactional "mark as Paid", payout history in Reports. **No
  online payment integration.**
- ✅ **End-of-Day Reconciliation** — agent submits expected-vs-actual cash
  daily; admin approves/rejects with an audit trail (`reviewedById`,
  `reviewedAt`, optional note)
- ✅ **Admin Dashboard** — 10 metrics/feeds (customer/agent counts, missed
  payments, collection totals across 3 windows, due-for-payout count, plus
  Recent Transactions / Recent Agent Activities feeds)
- ✅ **Agent Collection Summary** — 9 per-agent metrics on `/agent`
- ✅ **31-Day Tracking** — a rolling 31-day calendar-grid view of daily
  collection activity, shared component (`MonthlyTrackerGrid`) on both
  `/admin` (system-wide, every agent combined) and `/agent` (scoped to the
  signed-in agent only), backed by `getDailyTrackingSeries()` in the
  contribution repository
- ✅ **Reports module** — Daily/Weekly/Monthly/Agent/Customer/Payout History
  report types, all built from one shared `buildReportTable()` function so
  the on-screen table and the exported file are always identical; **PDF**
  export via `pdf-lib` (hand-rolled paginated table; ₦ substituted with
  "NGN" since the standard PDF font can't encode that glyph) and **Excel**
  export via `exceljs` (styled header row + optional totals row); download
  triggered by a Route Handler (`GET /api/reports/export`) so the browser
  handles the binary response natively via `Content-Disposition`
- ✅ Verified end-to-end: `npm run build` succeeds (20 routes, 0 errors); PM2
  restarted on the new build; admin login verified via curl (session
  cookie), and **all 6 report types × 2 export formats (12 combinations)**
  smoke-tested with real HTTP requests returning valid PDF/XLSX files.

## Features Not Yet Implemented (upcoming steps)
1. Full User Management (edit/disable Agents & Customers, password resets
   from the UI, self-service password change)
2. Audit Logs (system-wide — beyond the agent-assignment log and
   reconciliation review trail already built)
3. Notifications (email/SMS reminders, alerts — e.g. missed collection,
   plan matured and ready for payout)
4. Backup and Restore
5. Real end-to-end data: no plans/contributions/reconciliations/payouts
   have been created through the UI yet in this environment — the new
   tables are schema-verified and API-verified (built-report tested with 0
   rows) but not yet populated with real business data
6. Dashboard/report performance tuning once real data volume exists
   (current queries are correct but not yet indexed/tuned for scale)

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
