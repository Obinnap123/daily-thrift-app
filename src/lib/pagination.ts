/**
 * Shared pagination helpers.
 * ----------------------------------------------------------------------------
 * Keeps "how do we parse a page number from the URL" and "what's a safe
 * page size" logic in one place, used by both Agent and Customer list
 * pages (and any future paginated list).
 */

/** Default number of rows per page for admin list pages. */
export const DEFAULT_PAGE_SIZE = 10;

/** Parse a `?page=` search param into a safe, 1-based page number. */
export function parsePageParam(pageParam: string | string[] | undefined): number {
  const raw = Array.isArray(pageParam) ? pageParam[0] : pageParam;
  const parsed = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/** Compute the Prisma `skip`/`take` pair for a given page + page size. */
export function toSkipTake(page: number, pageSize: number = DEFAULT_PAGE_SIZE) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** Total number of pages for a given total row count + page size. */
export function totalPages(totalCount: number, pageSize: number = DEFAULT_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}
