"use client";

/**
 * Thin wrapper around NextAuth's SessionProvider.
 * Required because next-auth/react's context provider must be a client
 * component, but our root layout is (and should stay) a server component.
 */
import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import { ReactNode } from "react";

export function SessionProvider({ children }: { children: ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
