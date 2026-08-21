import "server-only";

import { headers } from "next/headers";

export async function getApplicationOrigin(): Promise<string> {
  const configured =
    process.env.APP_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (configured) return validatedOrigin(configured);

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL must be configured for staff invitation emails.");
  }

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) throw new Error("Application origin is unavailable.");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  return validatedOrigin(`${protocol}://${host}`);
}

function validatedOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Application origin must use HTTP or HTTPS.");
  }
  return url.origin;
}
