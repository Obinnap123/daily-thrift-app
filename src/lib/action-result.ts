/**
 * Shared result type for Server Actions / service functions.
 * ----------------------------------------------------------------------------
 * Server Actions can't just `throw` a validation error and expect a nice
 * message in the UI — the client would get a generic "An error occurred"
 * unless we're careful. Instead every mutating service function returns one
 * of these explicit success/failure shapes, and the calling form component
 * displays `result.message` directly as a friendly, expected error.
 */
export type ActionResult<TData = undefined> =
  | { success: true; data: TData }
  | { success: false; message: string; fieldErrors?: Record<string, string> };

export function ok<TData>(data: TData): ActionResult<TData> {
  return { success: true, data };
}

export function fail(
  message: string,
  fieldErrors?: Record<string, string>
): ActionResult<never> {
  return { success: false, message, fieldErrors };
}
