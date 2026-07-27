/**
 * Auth.js API route handler.
 * This single file wires up all NextAuth endpoints (/api/auth/signin,
 * /api/auth/callback, /api/auth/signout, etc.) via the App Router's
 * catch-all route convention.
 */
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
