/**
 * GET /api/reports/export?type=...&format=pdf|excel&...
 * ----------------------------------------------------------------------------
 * A Route Handler (not a Server Action) because exporting a file means
 * returning a binary response with a Content-Disposition header — Server
 * Actions can only return serializable data to the client, not a raw
 * downloadable Response. Admin-only, re-verified here from the session
 * directly (never trusting query params alone) since this endpoint sits
 * outside the /admin/* path that middleware already protects by URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { buildReportTable, type ReportType } from "@/lib/reports/build-report";
import { renderReportToPdfBuffer } from "@/lib/reports/pdf";
import { renderReportToExcelBuffer } from "@/lib/reports/xlsx";

const VALID_TYPES: ReportType[] = ["daily", "weekly", "monthly", "agent", "customer", "payout"];

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const type = searchParams.get("type");
  const exportFormat = searchParams.get("format");

  if (!type || !VALID_TYPES.includes(type as ReportType)) {
    return NextResponse.json({ error: "Invalid or missing report type" }, { status: 400 });
  }
  if (exportFormat !== "pdf" && exportFormat !== "excel") {
    return NextResponse.json({ error: "format must be 'pdf' or 'excel'" }, { status: 400 });
  }

  const table = await buildReportTable({
    type: type as ReportType,
    date: searchParams.get("date") ?? undefined,
    start: searchParams.get("start") ?? undefined,
    end: searchParams.get("end") ?? undefined,
    agentId: searchParams.get("agentId") ?? undefined,
    agentName: searchParams.get("agentName") ?? undefined,
    customerSearch: searchParams.get("customerSearch") ?? undefined,
  });

  const fileBaseName = `${type}-report-${new Date().toISOString().slice(0, 10)}`;

  if (exportFormat === "excel") {
    const buffer = await renderReportToExcelBuffer(table);
    // NextResponse's BodyInit type doesn't accept Node's Buffer directly under
    // this TS config — a plain Uint8Array view over the same bytes satisfies
    // the Web Fetch API's BodyInit (ArrayBufferView) without copying the data.
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileBaseName}.xlsx"`,
      },
    });
  }

  const buffer = await renderReportToPdfBuffer(table);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileBaseName}.pdf"`,
    },
  });
}
