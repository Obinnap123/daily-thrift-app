import "dotenv/config";
import { Client } from "pg";

interface PreflightRow {
  active_admin_count: number;
  total_admin_count: number;
  invitation_token_count: number;
  duplicate_token_user_count: number;
  contribution_count: number;
  payout_count: number;
  conflicting_object_count: number;
}

const connectionString = process.env.DIRECT_URL?.trim();
if (!connectionString) {
  throw new Error("DIRECT_URL is required for the production preflight check.");
}

async function main() {
  const client = new Client({
    connectionString,
    application_name: "davchuks-hardening-preflight",
  });

  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const result = await client.query<PreflightRow>(`
    SELECT
      (SELECT COUNT(*)::int FROM users WHERE role = 'ADMIN' AND "isActive" = true)
        AS active_admin_count,
      (SELECT COUNT(*)::int FROM users WHERE role = 'ADMIN')
        AS total_admin_count,
      (SELECT COUNT(*)::int FROM staff_email_verification_tokens)
        AS invitation_token_count,
      (
        SELECT COUNT(*)::int
        FROM (
          SELECT "userId"
          FROM staff_email_verification_tokens
          GROUP BY "userId"
          HAVING COUNT(*) > 1
        ) duplicate_token_users
      ) AS duplicate_token_user_count,
      (SELECT COUNT(*)::int FROM contributions) AS contribution_count,
      (SELECT COUNT(*)::int FROM payouts) AS payout_count,
      (
        SELECT COUNT(*)::int
        FROM pg_class
        WHERE relname IN (
          'users_one_active_admin_idx',
          'audit_logs_actorRole_createdAt_id_idx',
          'audit_logs_actorRole_outcome_createdAt_id_idx',
          'audit_logs_search_idx',
          'business_financial_summaries'
        )
      ) AS conflicting_object_count
    `);
    await client.query("ROLLBACK");

    const row = result.rows[0];
    if (!row) throw new Error("The preflight query returned no result.");

    console.log(JSON.stringify({
      safeToCreateSingleAdminConstraint: row.active_admin_count <= 1,
      activeAdminCount: row.active_admin_count,
      totalAdminCount: row.total_admin_count,
      invitationTokenCount: row.invitation_token_count,
      duplicateInvitationTokenUsers: row.duplicate_token_user_count,
      contributionCount: row.contribution_count,
      payoutCount: row.payout_count,
      conflictingMigrationObjects: row.conflicting_object_count,
    }, null, 2));

    if (row.active_admin_count > 1) {
      process.exitCode = 2;
    } else if (row.conflicting_object_count > 0) {
      process.exitCode = 3;
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Preflight check failed.");
  process.exitCode = 1;
});
