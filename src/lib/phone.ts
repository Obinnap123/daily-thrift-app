/**
 * Phone number normalization.
 * ----------------------------------------------------------------------------
 * Field agents will type phone numbers in all sorts of formats
 * ("0803 123 4567", "+234-803-123-4567", "234 803 123 4567"). To make phone
 * number lookups (customer login, uniqueness checks) reliable, we normalize
 * every number down to a consistent digits-only form (with an optional
 * leading "+") before it ever touches the database.
 *
 * We intentionally do NOT do full international phone parsing/formatting
 * here (that would pull in a much heavier dependency) — just enough
 * normalization to make matching consistent for this business's use case.
 */

/** Strip everything except digits and a single leading "+". */
export function normalizePhone(rawPhone: string): string {
  const trimmed = rawPhone.trim();
  const hasLeadingPlus = trimmed.startsWith("+");
  const digitsOnly = trimmed.replace(/[^0-9]/g, "");
  return hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
}
