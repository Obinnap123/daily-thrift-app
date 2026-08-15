# Security Remediation Tracker

Baseline recorded: 13 August 2026
Baseline commit: `2d87551` (`feat: add installable online-first PWA`)

## Baseline results

- TypeScript: passed with no errors.
- ESLint: passed with no errors and three existing React Compiler optimization warnings.
- Prisma schema validation: passed.
- Production build: passed; all 29 application pages were generated successfully.
- Dependency audit: 0 critical, 9 high, and 3 moderate reported findings.
- Tracked secrets: no `.env` file, database URL, authentication secret, or private key found in the current tracked source.
- Unauthenticated access: dashboard sections redirect to login and report export returns `403`.
- PWA cache: restricted to the offline page, manifest, and public icons; authenticated or financial responses are not cached.

## Database integrity snapshot

The read-only active-period check returned:

- Active savings periods: 2
- Customers with an active savings period: 2
- Customers with multiple active savings periods: 0

This means the database is clean before the future one-active-period constraint is introduced.

## Remediation checklist

- [x] Add and verify browser security headers.
- [x] Move customer photographs to private storage with authorized access.
- [x] Enforce one active savings period per customer at database level.
- [x] Revoke existing sessions immediately after account deactivation or security changes.
- [x] Add shared login rate limiting, progressive delays, and temporary lockout.
- [x] Make financial dates and concurrent financial operations safe.
- [x] Save critical financial audit records atomically with their operations.
- [x] Upgrade vulnerable production dependencies with regression testing.
- [x] Run the complete role-based security regression suite on the deployed HTTPS application.

## Release safeguards

- Do not apply a database migration until the target Supabase project has an appropriate recoverable backup or point-in-time recovery confirmed.
- Do not use `npm audit fix --force`; upgrade and verify packages deliberately.
- Do not run password spraying, destructive payloads, or financial mutations against production during security testing.
- Preserve existing financial history throughout all remediations.

## Step 2 verification

The following headers are applied globally and were verified on application
pages, Auth.js endpoints, the manifest, the service worker, and the offline
fallback:

- Content Security Policy with framing, plugins, foreign forms, and foreign
  base URLs blocked.
- HTTP Strict Transport Security for deployed HTTPS connections.
- `X-Content-Type-Options: nosniff`.
- `X-Frame-Options: DENY` as legacy clickjacking defense.
- Strict-origin referrer policy.
- Permissions Policy disabling camera, microphone, geolocation, payment, USB,
  and browsing-topics APIs.
- Same-origin opener isolation.

The production policy does not permit `unsafe-eval`. Eleven generated Next.js
assets referenced by the login page were requested successfully under the
policy, and the production build passed.

## Step 3 private-photo configuration

Customer passport photos are now decoded, validated by their actual content,
re-oriented, resized, re-encoded to WebP, and stripped of embedded metadata
before upload. The database stores a private object key, and the browser can
retrieve it only through an authenticated application endpoint that enforces:

- Admin: any customer photo.
- Agent: photos belonging to currently assigned customers only.
- Customer: their own photo only.
- Signed-out or unrelated users: no access.

Before enabling photo uploads in an environment:

1. Create a **private** Supabase Storage bucket named
   `customer-passport-photos` (or set `SUPABASE_STORAGE_BUCKET` to another
   private bucket name).
2. Set server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment
   variables in Vercel and local development. Never prefix the service-role
   key with `NEXT_PUBLIC_` or expose it to browser code.
3. Limit the bucket to `image/webp` objects and a maximum object size of 5 MB.
4. Redeploy and run the Admin, assigned-Agent, unassigned-Agent, owning-Customer,
   unrelated-Customer, and signed-out access checks.

The database snapshot contained no existing passport-photo records, so no
legacy public files or database values require migration.

Code-level verification completed successfully:

- Five-case authorization matrix (Admin, assigned Agent, unassigned Agent,
  owning Customer, and unrelated Customer).
- Signed-out photo requests return `401`.
- TypeScript, focused ESLint, Prisma validation, and the production build.

The required local variables are present. A live storage test confirmed that
the configured bucket exists, is private, and supports server-side upload and
download; its temporary test object was deleted successfully. The complete
browser role matrix will be repeated against the deployed application during
the final security regression step.

## Step 4 active-period integrity

A PostgreSQL partial unique index now permits unlimited historical savings
periods while allowing at most one `ACTIVE` period for each customer. All
three application paths that can open a period handle concurrent conflicts:
the explicit Start Plan flow and both automatic first-payment-after-payout
flows.

Before deployment, a logical database backup was created and its archive
catalogue verified at:

`C:\tmp\davchuks-pre-step4-20260814.backup`

Migration `20260813120000_one_active_plan_per_customer` was applied
successfully. Prisma reports the database schema up to date. A transactional
duplicate-insert test confirmed that the database rejects a second active
period, left no test data behind, and the final integrity check found zero
customers with multiple active periods.

## Step 5 session revocation

Every account now has a monotonic `sessionVersion` security stamp. New JWTs
snapshot that value, and every Node-side authorization check compares the
signed claim with the current database account. A session is rejected when
the account is inactive or deleted, the role differs, the security stamp has
changed, or a legacy/malformed token has no valid stamp.

Agent deactivation and reactivation always increment the stamp. Agent login
email changes and Customer login phone changes increment it only when that
identifier actually changes. Reactivation cannot revive a session that was
issued before deactivation. The login route remains reachable with a stale
Edge-readable token, preventing an authentication redirect loop.

A verified pre-migration backup is stored outside the repository at:

`C:\tmp\davchuks-pre-step5-20260814.backup`

Migration `20260814100000_user_session_version` was applied successfully.
All seven existing accounts have valid versions, Prisma reports the schema up
to date, the seven-case revocation matrix passed, and the production build
completed successfully. Sessions issued before this release intentionally
require one fresh sign-in; accounts and passwords are unchanged.

## Step 6 shared login protection

Login throttling is stored in PostgreSQL so every local or Vercel application
instance shares the same counters. Two independent keyed-HMAC buckets protect
each request: the normalized login identifier and the platform-observed client
IP. Raw emails, phone numbers, and IP addresses are never stored.

- Identifier: temporary 15-minute lock on failure 5 within 15 minutes.
- IP: temporary 15-minute lock on failure 25 across identifiers.
- Progressive delay: 250 ms, 500 ms, 1 second, then a 2-second cap.
- Successful login: clears only the identifier bucket, preventing an attacker
  from resetting the shared password-spraying counter with their own account.
- Unknown accounts perform a real dummy bcrypt verification and receive the
  same generic response behavior as existing accounts.
- Throttle records older than 24 hours are removed opportunistically.

A verified pre-migration backup is stored outside the repository at:

`C:\tmp\davchuks-pre-step6-20260814.backup`

Migration `20260814130000_login_throttles` was applied successfully. Live
temporary tests confirmed hashed keys, all progressive delays, identifier
lockout on failure 5, shared-IP lockout on failure 25, and correct success
reset behavior. Every temporary test row was removed, Prisma reports the
schema up to date, and TypeScript, ESLint, and the production build pass.

## Step 7 financial transaction safety

The server uses `Africa/Lagos` as the single authority for operational dates
and stores calendar values at UTC midnight for PostgreSQL `DATE` columns.
Agents remain pinned to today's Lagos date, while Admin backdating is retained;
future-dated contributions and payouts are now rejected server-side.

Contributions, Quick Pay allocations, and payouts now acquire a PostgreSQL
transaction-scoped advisory lock for the affected customer. After acquiring
the lock, each operation re-reads the active plan and balance, performs every
calculation, and commits every related write at `SERIALIZABLE` isolation. This
means concurrent operations resolve in a defined order: a payout includes a
payment that commits first, while a payment that follows a completed payout
opens the customer's next period. Two payouts cannot close or pay the same
period twice. Serialization failures and deadlocks are retried up to three
times only after PostgreSQL has rolled the failed attempt back.

End-of-day reconciliation submission is similarly serialized for each
agent/date and uses the database uniqueness constraint as a final safeguard.
Its expected physical cash snapshot now includes cash contributions only, not
bank transfers. Reconciliation review uses a conditional status update so two
Admin reviews cannot both succeed.

TypeScript, focused ESLint, Prisma validation, and the production build pass.
A live two-connection check through the configured Supabase pooler confirmed
that the second transaction waited for the first transaction-scoped advisory
lock; the test changed zero database rows. No schema migration was required.

## Step 8 atomic financial audit records

Successful contributions, missed-visit records, Quick Pay transactions,
payouts, reconciliation submissions, and reconciliation reviews now insert
their audit record through the same Prisma transaction as the financial or
reconciliation mutation. The transaction cannot commit unless both the
business record and its audit record are saved. An audit database failure
therefore rolls the complete operation back instead of leaving unaudited
financial history.

The Server Action captures the platform-observed client IP and browser details
before entering the service transaction. Audit metadata records safe business
context such as customer/plan identifiers, receipt reference, amounts, method,
date, outcome, and override status; it does not include passwords, secrets, or
payment credentials. Successful audit records now reference the actual
Contribution, Payout, or DailyReconciliation row created by the operation.

Rejected financial attempts continue to produce FAILURE audit records, but
their writes are now required rather than silently caught. Existing
best-effort logging remains available for non-financial operational events.
The old post-commit success audit calls were removed to prevent duplicates.

No schema migration or financial-data mutation was required. TypeScript,
focused ESLint, Prisma validation, and the production build all pass.

## Step 9 dependency remediation

The vulnerable runtime packages were upgraded deliberately without
`npm audit fix --force` or a breaking ExcelJS downgrade:

- Next.js `16.2.12` to `16.3.1`, including patched PostCSS and bundled Sharp.
- Sharp `0.34.4` to `0.35.3`.
- Prisma CLI, Client, and PostgreSQL adapter `7.9.0` to `7.9.1`, replacing the
  vulnerable `@prisma/dev`, `find-my-way`, and Valibot chain.
- `@hookform/resolvers` `5.5.7` to `5.8.0`.
- Safe transitive patches for Fast URI, Nano ID, and both affected
  brace-expansion release lines.

ExcelJS `4.4.0` has no newer release and its upstream dependency still pins
UUID 8.3.2. ExcelJS uses UUID v4 and is CommonJS-based, so UUID is narrowly
overridden to patched CommonJS-compatible `11.1.1`; a real workbook was
written and read back successfully. Development-only JS-YAML and
TypeScript-ESLint brace-expansion advisories are likewise fixed with scoped
patch overrides. The non-vulnerable ESLint preset remains at `16.2.12`
because `16.3.1` introduced a severe lint startup regression; the patched
Next.js runtime remains at `16.3.1` and both lint and build compatibility pass.

Final `npm audit --omit=dev` and complete `npm audit` results are both zero
vulnerabilities. Prisma generation/validation, TypeScript, ESLint, a Sharp
WebP transform, an Excel workbook round-trip, and the Next.js production build
all pass. No database migration or application business logic changed.

## Step 10 deployed security regression

The Vercel HTTPS Preview for commit `bd6a1c0` built successfully and was tested
without performing payments, payouts, reconciliations, account edits, or other
financial mutations.

- Signed-out Admin, Agent, Customer, and Notifications routes redirect to the
  appropriate login page. Signed-out report export returns `403`, and private
  customer photographs return `401`.
- Admin can access Admin pages and staff notifications, is redirected away
  from Agent and Customer sections, can generate a real Excel report, and is
  authorized at the private-photo boundary.
- Agent can access the Agent dashboard and staff notifications, is redirected
  away from Admin and Customer sections, cannot export Admin reports, and
  receives the non-enumerating response from the private-photo endpoint.
- Customer can access the Customer dashboard, is redirected away from Admin,
  Agent, and staff Notifications sections, cannot export Admin reports, and
  receives the non-enumerating response from the private-photo endpoint.
- Global CSP, anti-clickjacking, `nosniff`, referrer, permissions, opener, and
  HSTS protections are present on the deployed application. Authenticated
  application responses remain private and non-cacheable.
- The manifest, service worker, and public offline document load successfully;
  the public shell is the only application cache and browser storage contains
  no financial or authenticated records.
- The deployed Admin dashboard has no page-level horizontal overflow at a
  390-pixel mobile viewport. Lighthouse snapshot scores are 100 for
  accessibility, best practices, SEO, and agentic browsing.

The Admin browser session used for the test was revoked through the existing
session-version control after verification. Agent and Customer checks used
short-lived signed test sessions without reading or changing their passwords;
their isolated browser contexts and temporary session material were destroyed
after the checks completed. Passwords, account profiles, and financial history
remain unchanged; the Admin must sign in once with the existing password after
the deliberate test-session revocation.
