import "server-only";

import { Prisma, type AuditOutcome } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  decodeAuditCursor,
  encodeAuditCursor,
  type AuditCursor,
} from "@/lib/audit-pagination";

const PAGE_SIZE = 25;

interface AdminActivityRow {
  id: string;
  action: string;
  outcome: AuditOutcome;
  summary: string;
  createdAt: Date;
  actorName: string | null;
}

export interface AdminActivityPage {
  events: AdminActivityRow[];
  previousCursor: string | null;
  nextCursor: string | null;
}

export async function listAdminActivity(input: {
  query?: string;
  outcome?: AuditOutcome;
  after?: string;
  before?: string;
}): Promise<AdminActivityPage> {
  const before = decodeAuditCursor(input.before);
  const after = before ? null : decodeAuditCursor(input.after);
  const cursor = before ?? after;
  const filters: Prisma.Sql[] = [Prisma.sql`al."actorRole" = CAST('ADMIN' AS "Role")`];

  if (input.outcome) {
    filters.push(Prisma.sql`al."outcome" = CAST(${input.outcome} AS "AuditOutcome")`);
  }
  if (input.query) {
    filters.push(Prisma.sql`
      to_tsvector('simple', COALESCE(al."action", '') || ' ' || COALESCE(al."summary", ''))
      @@ plainto_tsquery('simple', ${input.query})
    `);
  }
  if (cursor) {
    filters.push(cursorFilter(cursor, Boolean(before)));
  }

  const order = before ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const rows = await prisma.$queryRaw<AdminActivityRow[]>(Prisma.sql`
    SELECT
      al."id",
      al."action",
      al."outcome",
      al."summary",
      al."createdAt",
      u."name" AS "actorName"
    FROM "audit_logs" al
    LEFT JOIN "users" u ON u."id" = al."actorId"
    WHERE ${Prisma.join(filters, " AND ")}
    ORDER BY al."createdAt" ${order}, al."id" ${order}
    LIMIT ${PAGE_SIZE + 1}
  `);

  const hasExtra = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);
  const events = before ? pageRows.reverse() : pageRows;
  const first = events[0];
  const last = events.at(-1);
  const hasPrevious = before ? hasExtra : Boolean(after);
  const hasNext = before ? events.length > 0 : hasExtra;

  return {
    events,
    previousCursor: hasPrevious && first
      ? encodeAuditCursor({ createdAt: first.createdAt, id: first.id })
      : null,
    nextCursor: hasNext && last
      ? encodeAuditCursor({ createdAt: last.createdAt, id: last.id })
      : null,
  };
}

function cursorFilter(cursor: AuditCursor, newer: boolean): Prisma.Sql {
  const comparison = newer ? Prisma.sql`>` : Prisma.sql`<`;
  return Prisma.sql`
    (
      al."createdAt" ${comparison} ${cursor.createdAt}
      OR (al."createdAt" = ${cursor.createdAt} AND al."id" ${comparison} ${cursor.id})
    )
  `;
}
