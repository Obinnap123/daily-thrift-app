import { dateKey, today, toDateOnly } from "@/lib/date";

export interface TrackingCell {
  day: number;
  date: Date | null;
  state: "paid" | "pending" | "outside" | "invalid";
}

export interface TrackingSheet {
  key: string;
  label: string;
  cells: TrackingCell[];
  paid: number;
  eligible: number;
  status: "CURRENT" | "COMPLETED_AWAITING_PAYOUT" | "PAID_OUT";
}

export function buildTrackingSheets(startDate: Date, paidDates: Date[], paidOut: boolean): TrackingSheet[] {
  const normalizedStart = toDateOnly(startDate);
  const normalizedPaidDates = paidDates.map(toDateOnly);
  const paidKeys = new Set(normalizedPaidDates.map(dateKey));
  const lastPaid = normalizedPaidDates.reduce(
    (latest, date) => date > latest ? date : latest,
    normalizedStart
  );
  const currentDate = today();
  const end = lastPaid > currentDate ? lastPaid : currentDate;
  const sheets: TrackingSheet[] = [];

  for (
    let month = new Date(Date.UTC(normalizedStart.getUTCFullYear(), normalizedStart.getUTCMonth(), 1));
    month <= new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1))
  ) {
    const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
    const cells = Array.from({ length: 31 }, (_, index): TrackingCell => {
      const day = index + 1;
      if (day > daysInMonth) return { day, date: null, state: "invalid" };
      const date = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day));
      if (date < normalizedStart) return { day, date, state: "outside" };
      return { day, date, state: paidKeys.has(dateKey(date)) ? "paid" : "pending" };
    });
    const eligible = cells.filter((cell) => cell.state !== "invalid" && cell.state !== "outside").length;
    const paid = cells.filter((cell) => cell.state === "paid").length;
    sheets.push({
      key: dateKey(month).slice(0, 7),
      label: new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(month),
      cells,
      paid,
      eligible,
      status: paidOut ? "PAID_OUT" : paid === eligible ? "COMPLETED_AWAITING_PAYOUT" : "CURRENT",
    });
  }
  return sheets;
}
