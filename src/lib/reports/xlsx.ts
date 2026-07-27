/**
 * Excel (.xlsx) export for any ReportTable, via exceljs.
 * ----------------------------------------------------------------------------
 * Deliberately generic over ReportTable (columns + rows + optional totals)
 * rather than one bespoke function per report type — every report shares
 * the same "table with a totals row" shape, so one renderer covers all six.
 */
import "server-only";
import ExcelJS from "exceljs";
import type { ReportTable } from "./build-report";

export async function renderReportToExcelBuffer(table: ReportTable): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Davchuks Daily Thrift Management System";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(table.title.slice(0, 31) || "Report");

  // Title + subtitle rows (merged across all columns) above the header.
  sheet.mergeCells(1, 1, 1, table.columns.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = table.title;
  titleCell.font = { bold: true, size: 14 };

  sheet.mergeCells(2, 1, 2, table.columns.length);
  const subtitleCell = sheet.getCell(2, 1);
  subtitleCell.value = table.subtitle;
  subtitleCell.font = { italic: true, color: { argb: "FF666666" } };

  sheet.addRow([]); // spacer row

  const headerRow = sheet.addRow(table.columns.map((column) => column.label));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } };
  });

  for (const row of table.rows) {
    sheet.addRow(table.columns.map((column) => row[column.key] ?? ""));
  }

  if (table.totalsRow) {
    const totalsRowExcel = sheet.addRow(table.columns.map((column) => table.totalsRow![column.key] ?? ""));
    totalsRowExcel.eachCell((cell) => {
      cell.font = { bold: true };
      cell.border = { top: { style: "thin" } };
    });
  }

  sheet.columns.forEach((column) => {
    column.width = 20;
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
