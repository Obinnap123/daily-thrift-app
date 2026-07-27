/**
 * Export PDF / Export Excel buttons for the Reports page.
 * ----------------------------------------------------------------------------
 * These are plain anchor tags pointing at the GET /api/reports/export route
 * handler, NOT a client-side fetch. The browser downloads the file on its own
 * because the route handler sets a `Content-Disposition: attachment` header
 * — no blob handling, loading state, or JS needed on this end. Kept as a
 * server-renderable component (no "use client") since it has no interactivity
 * beyond being a link.
 */
interface ExportButtonsProps {
  /** URL-encoded filter query string built by the Reports page, e.g. "type=daily&date=2026-07-27" */
  exportQuery: string;
}

export function ExportButtons({ exportQuery }: ExportButtonsProps) {
  const baseHref = `/api/reports/export?${exportQuery}`;

  return (
    <div className="flex flex-shrink-0 gap-2">
      <a
        href={`${baseHref}&format=pdf`}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400"
      >
        Export PDF
      </a>
      <a
        href={`${baseHref}&format=excel`}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      >
        Export Excel
      </a>
    </div>
  );
}
