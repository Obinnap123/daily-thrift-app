"use client";

/**
 * Simple horizontal nav for a dashboard section. Highlights the active link
 * based on the current pathname. Shared by Admin and Agent dashboards
 * (Customer dashboard currently has no sub-pages, so it doesn't use this).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavLink {
  href: string;
  label: string;
}

export function DashboardNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 bg-white px-4 sm:px-6">
      {links.map((link) => {
        // Exact match for a section's own root ("/admin"), prefix match for
        // sub-pages ("/admin/agents/123") so nested routes stay highlighted.
        const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors",
              isActive
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-gray-500 hover:text-gray-800"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
