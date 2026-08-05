export type NavigationRole = "ADMIN" | "AGENT";

export interface AppNavigationItem {
  href: string;
  label: string;
  icon: "home" | "people" | "customer" | "tracking" | "money" | "check" | "report" | "audit" | "settings";
}

export const APP_NAVIGATION: Record<NavigationRole, AppNavigationItem[]> = {
  ADMIN: [
    { href: "/admin", label: "Overview", icon: "home" },
    { href: "/admin/agents", label: "Agents", icon: "people" },
    { href: "/admin/customers", label: "Customers", icon: "customer" },
    { href: "/admin/tracking", label: "Tracking", icon: "tracking" },
    { href: "/admin/payouts", label: "Payouts", icon: "money" },
    { href: "/admin/reconciliations", label: "Reconciliations", icon: "check" },
    { href: "/admin/reports", label: "Reports", icon: "report" },
    { href: "/admin/audit", label: "Audit log", icon: "audit" },
    { href: "/admin/settings", label: "Settings", icon: "settings" },
  ],
  AGENT: [
    { href: "/agent", label: "Overview", icon: "home" },
    { href: "/agent/tracking", label: "Tracking", icon: "tracking" },
    { href: "/agent/payouts", label: "Payouts", icon: "money" },
    { href: "/agent/collections", label: "Today's collections", icon: "customer" },
    { href: "/agent/reconciliation", label: "End-of-day report", icon: "check" },
  ],
};

export function navigationForPath(pathname: string): AppNavigationItem[] {
  return pathname.startsWith("/admin") ? APP_NAVIGATION.ADMIN : APP_NAVIGATION.AGENT;
}
