/**
 * PDF export for any ReportTable, via pdf-lib.
 * ----------------------------------------------------------------------------
 * pdf-lib is a low-level PDF drawing library (no built-in table layout), so
 * this hand-rolls a simple paginated table: a title/subtitle header on page
 * 1, then a header row + data rows drawn at fixed column x-offsets,
 * starting a new page automatically once the current one runs out of
 * vertical space. Kept intentionally simple (no wrapping within a cell,
 * fixed column widths) since report rows here are short, single-line
 * values — this is a records printout, not a typeset document.
 */
import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { ReportTable } from "./build-report";

const PAGE_WIDTH = 792; // US Letter landscape, in points (11in x 72)
const PAGE_HEIGHT = 612; // 8.5in x 72
const MARGIN = 40;
const ROW_HEIGHT = 20;
const HEADER_FONT_SIZE = 9;
const BODY_FONT_SIZE = 9;

/**
 * pdf-lib's standard fonts (Helvetica/HelveticaBold) use WinAnsi encoding,
 * which cannot represent the Naira sign "₦" (or other characters outside
 * that codepage). Rather than embed a custom Unicode font just for one
 * symbol, we swap it for the plain-ASCII "NGN" abbreviation before drawing —
 * this only affects the PDF renderer; the on-screen table and Excel export
 * (which don't have this font limitation) keep the "₦" symbol as-is.
 */
function sanitizeForWinAnsi(value: string): string {
  return value.replace(/₦/g, "NGN");
}

export async function renderReportToPdfBuffer(table: ReportTable): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const usableWidth = PAGE_WIDTH - MARGIN * 2;
  const columnWidth = usableWidth / table.columns.length;

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN;

  // Title + subtitle (page 1 only).
  page.drawText(sanitizeForWinAnsi(table.title), {
    x: MARGIN,
    y: cursorY,
    size: 16,
    font: boldFont,
    color: rgb(0.02, 0.4, 0.3),
  });
  cursorY -= 20;
  page.drawText(sanitizeForWinAnsi(table.subtitle), {
    x: MARGIN,
    y: cursorY,
    size: 10,
    font: regularFont,
    color: rgb(0.4, 0.4, 0.4),
  });
  cursorY -= 28;

  function drawHeaderRow() {
    table.columns.forEach((column, index) => {
      page.drawText(sanitizeForWinAnsi(column.label), {
        x: MARGIN + index * columnWidth,
        y: cursorY,
        size: HEADER_FONT_SIZE,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
    });
    cursorY -= 4;
    page.drawLine({
      start: { x: MARGIN, y: cursorY },
      end: { x: MARGIN + usableWidth, y: cursorY },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });
    cursorY -= ROW_HEIGHT;
  }

  function newPage() {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursorY = PAGE_HEIGHT - MARGIN;
    drawHeaderRow();
  }

  drawHeaderRow();

  function drawDataRow(row: Record<string, string>, font: PDFFont) {
    table.columns.forEach((column, index) => {
      const value = sanitizeForWinAnsi(row[column.key] ?? "");
      page.drawText(truncateForColumn(value, columnWidth, font, BODY_FONT_SIZE), {
        x: MARGIN + index * columnWidth,
        y: cursorY,
        size: BODY_FONT_SIZE,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
    });
    cursorY -= ROW_HEIGHT;
  }

  for (const row of table.rows) {
    if (cursorY < MARGIN + ROW_HEIGHT) {
      newPage();
    }
    drawDataRow(row, regularFont);
  }

  if (table.totalsRow) {
    if (cursorY < MARGIN + ROW_HEIGHT) {
      newPage();
    }
    cursorY -= 4;
    page.drawLine({
      start: { x: MARGIN, y: cursorY + ROW_HEIGHT - 4 },
      end: { x: MARGIN + usableWidth, y: cursorY + ROW_HEIGHT - 4 },
      thickness: 1,
      color: rgb(0.7, 0.7, 0.7),
    });
    drawDataRow(table.totalsRow, boldFont);
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/** Rough character-count-based truncation to keep a value from overflowing its column. */
function truncateForColumn(value: string, columnWidth: number, font: PDFFont, size: number): string {
  const maxWidth = columnWidth - 8;
  if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;

  let truncated = value;
  while (truncated.length > 1 && font.widthOfTextAtSize(`${truncated}…`, size) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

// Re-exported only for type-checking convenience in callers that need a page reference.
export type { PDFPage };
