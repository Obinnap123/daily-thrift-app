import "dotenv/config";
import { Client } from "pg";

interface VerificationRow {
  active_admin_count: number;
  required_column_count: number;
  required_index_count: number;
  required_trigger_count: number;
  summary_row_count: number;
  lifetime_collections_match: boolean;
  gross_savings_match: boolean;
  customer_payouts_match: boolean;
  commission_match: boolean;
}

const connectionString = process.env.DIRECT_URL?.trim();
if (!connectionString) {
  throw new Error("DIRECT_URL is required for the production verification check.");
}

async function main() {
  const client = new Client({
    connectionString,
    application_name: "davchuks-hardening-verification",
  });

  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    const result = await client.query<VerificationRow>(`
      WITH financial_totals AS (
        SELECT
          COALESCE((SELECT SUM("amount") FROM "contributions" WHERE "status" = 'COLLECTED'), 0) AS lifetime_collections,
          COALESCE((SELECT SUM("grossSavings") FROM "payouts"), 0) AS gross_savings,
          COALESCE((SELECT SUM("customerAmount") FROM "payouts"), 0) AS customer_payouts,
          COALESCE((SELECT SUM("commissionAmount") FROM "payouts"), 0) AS commission
      ),
      summary AS (
        SELECT * FROM "business_financial_summaries" WHERE "id" = 'default'
      )
      SELECT
        (SELECT COUNT(*)::int FROM "users" WHERE "role" = 'ADMIN' AND "isActive" = true AND "archivedAt" IS NULL)
          AS active_admin_count,
        (
          SELECT COUNT(*)::int
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (table_name, column_name) IN (
              ('users', 'archivedAt'),
              ('staff_email_verification_tokens', 'deliveredAt')
            )
        ) AS required_column_count,
        (
          SELECT COUNT(*)::int
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname IN (
              'users_one_active_admin_idx',
              'audit_logs_actorRole_createdAt_id_idx',
              'audit_logs_actorRole_outcome_createdAt_id_idx',
              'audit_logs_search_idx'
            )
        ) AS required_index_count,
        (
          SELECT COUNT(DISTINCT trigger_name)::int
          FROM information_schema.triggers
          WHERE trigger_schema = 'public'
            AND trigger_name IN (
              'contributions_financial_summary_trigger',
              'payouts_financial_summary_trigger'
            )
        ) AS required_trigger_count,
        (SELECT COUNT(*)::int FROM summary) AS summary_row_count,
        (SELECT s."lifetimeCollections" = f.lifetime_collections FROM summary s CROSS JOIN financial_totals f)
          AS lifetime_collections_match,
        (SELECT s."grossSavingsClosed" = f.gross_savings FROM summary s CROSS JOIN financial_totals f)
          AS gross_savings_match,
        (SELECT s."paidOutToCustomers" = f.customer_payouts FROM summary s CROSS JOIN financial_totals f)
          AS customer_payouts_match,
        (SELECT s."commissionEarned" = f.commission FROM summary s CROSS JOIN financial_totals f)
          AS commission_match
    `);
    await client.query("ROLLBACK");

    const row = result.rows[0];
    if (!row) throw new Error("The verification query returned no result.");

    const checks = {
      atMostOneActiveAdmin: row.active_admin_count <= 1,
      requiredColumnsPresent: row.required_column_count === 2,
      requiredIndexesPresent: row.required_index_count === 4,
      financialTriggersPresent: row.required_trigger_count === 2,
      financialSummaryPresent: row.summary_row_count === 1,
      lifetimeCollectionsMatch: row.lifetime_collections_match === true,
      grossSavingsMatch: row.gross_savings_match === true,
      customerPayoutsMatch: row.customer_payouts_match === true,
      commissionMatch: row.commission_match === true,
    };

    console.log(JSON.stringify(checks, null, 2));
    if (Object.values(checks).some((passed) => !passed)) process.exitCode = 2;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Verification check failed.");
  process.exitCode = 1;
});
