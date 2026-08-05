/**
 * NextAuth (Auth.js) type augmentation.
 * ----------------------------------------------------------------------------
 * By default, the `Session.user` object only has name/email/image. Our app
 * needs `id` and `role` available everywhere we read the session, so we
 * merge our custom fields into the library's types here.
 */
import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
  }
}
