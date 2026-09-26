# Super Admin hardening release

This release changes the database and application together. Do not leave the
new migration deployed with the previous application version for an extended
period because invitation-token storage changes from one token per user to a
short-lived pending-and-delivered flow.

## Before release

1. Confirm a current Supabase backup or create an on-demand backup.
2. Run `npm run db:preflight:hardening`. It is read-only and must report:
   - `safeToCreateSingleAdminConstraint: true`
   - no conflicting migration objects
3. Run `npx prisma migrate status` and confirm that only
   `20260926120000_super_admin_production_hardening` is pending.
4. Confirm the production build and automated checks pass.
5. Ask staff to pause payments, payouts, invitations, and account changes for
   the short release window.

## Release order

1. Run `npm run db:migrate:deploy`.
2. Deploy the exact commit containing the migration and matching application
   code immediately.
3. Run `npx prisma migrate status` again.
4. Run `npm run db:verify:hardening`. It uses a read-only transaction to
   verify the database safeguards and reconcile the cached financial totals
   against the underlying contribution and payout records.
5. Perform the smoke checks below before ending the maintenance window.

## Smoke checks

- Existing Super Admin and Admin accounts can sign in through the correct
  workspaces and cannot enter each other's protected routes.
- The Super Admin dashboard shows the same financial totals as before.
- Admin activity opens, filters, and moves to the next and previous pages.
- An Admin invitation can be sent, resent, and completed once.
- A deactivated Admin can be archived, cannot sign in, and remains present in
  historical activity.
- A normal contribution and payout update their corresponding dashboards.

## Recovery

If the migration fails, do not mark it as applied. Prisma/PostgreSQL will stop
the release and the previous application remains in use; investigate the
reported statement before retrying.

If the migration succeeds but the new deployment fails, keep staff writes
paused and redeploy the new commit after correcting the application failure.
Avoid rolling the application back by itself because the old invitation code
expects the former one-token-per-user database constraint.

For a database-level recovery, restore the confirmed pre-release Supabase
backup. Do not manually delete customer, contribution, payout, or audit data.
