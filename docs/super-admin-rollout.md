# Super Admin rollout

The current seeded Admin is intentionally **not** promoted by a schema migration or by `db:seed`. Changing its role before the new application is deployed would revoke its sessions and prevent it from using the old Admin workspace.

1. Review and deploy the `SUPER_ADMIN` enum migration (`npm run db:migrate:deploy`) using the production `DIRECT_URL`. This migration only adds an enum value; it does not change any account or financial record.
2. Deploy the application code. Check that the existing Admin can still sign in and that `/super-admin` rejects a regular Admin session.
3. Ensure `SEED_ADMIN_EMAIL` identifies the one existing company Admin account. Run `npm run db:promote-seeded-admin -- --confirm` once with production database access. The command verifies the account, prevents a second active Super Admin, updates only that user's role, increments its session version, and writes an audit event. Historical records and their original Admin role snapshots remain unchanged.
4. Sign in again through **Admin Login** using the same email and password. The account should now open `/super-admin`.
5. On **Admin account**, invite the new regular Admin at their own email address. They verify the email and create their private password. Then verify that they enter `/admin` and see the existing company-wide figures, while the Super Admin sees Admin actions in the oversight workspace.
6. Test each role's access boundary, Admin invitations and deactivation, and a normal agent/customer workflow before treating the rollout as complete.

Do not run the promotion command before steps 1 and 2. Do not rerun `db:seed` to promote an existing account; the seed deliberately leaves existing roles untouched.
