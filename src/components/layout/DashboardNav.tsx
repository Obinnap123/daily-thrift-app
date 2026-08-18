"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { navigationForPath, type AppNavigationItem } from "@/components/layout/navigation";
import { useNavigationProgress } from "@/components/providers/NavigationProgressProvider";

export interface NavLink { href: string; label: string }

/** `links` remains accepted while legacy pages migrate; the canonical role
 * configuration is always used so navigation cannot drift between routes. */
export function DashboardNav({ links: _links }: { links?: NavLink[] }) {
  void _links;
  const pathname = usePathname();
  const links = navigationForPath(pathname);
  const current = links.findLast((link) => isNavigationLinkActive(pathname, link.href));
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const navigationId = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const backgroundRegions = document.querySelectorAll<HTMLElement>(".app-header, .dashboard-nav + main");
    backgroundRegions.forEach((region) => { region.inert = true; });
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      backgroundRegions.forEach((region) => { region.inert = false; });
    };
  }, [open]);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handlePanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") return close();
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="dashboard-nav app-chrome">
      <div className="sticky top-0 z-30 flex min-h-12 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
        <p className="truncate text-sm font-medium text-ink">{current?.label ?? "Menu"}</p>
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls={navigationId}
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-ink hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          <MenuIcon /> Menu
        </button>
      </div>

      <aside aria-label="Main navigation" className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface-raised px-3 py-4 lg:flex">
        <SidebarContent links={links} pathname={pathname} />
      </aside>

      {open && <>
        <button type="button" aria-label="Close navigation" className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={close} />
        <aside ref={panelRef} id={navigationId} aria-label="Main navigation" onKeyDown={handlePanelKeyDown} className="fixed inset-y-0 left-0 z-50 flex w-[min(18rem,86vw)] flex-col border-r border-line bg-surface-raised px-3 py-4 shadow-2xl lg:hidden">
          <SidebarContent links={links} pathname={pathname} onClose={close} />
        </aside>
      </>}
    </div>
  );
}

function SidebarContent({ links, pathname, onClose }: { links: AppNavigationItem[]; pathname: string; onClose?: () => void }) {
  return <>
    <div className="flex items-center justify-between px-2 pb-6 pt-1">
      <Link href={pathname.startsWith("/admin") ? "/admin" : "/agent"} className="flex items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
        <BrandMark />
        <span><span className="block text-sm font-bold text-ink">Davchuks</span><span className="block text-xs text-ink-muted">Daily Thrift</span></span>
      </Link>
      {onClose && <button type="button" onClick={onClose} aria-label="Close menu" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-xl text-ink-muted hover:bg-surface-hover hover:text-ink">×</button>}
    </div>
    <nav className="flex flex-1 flex-col gap-1" aria-label="Dashboard sections">
      {links.map((link) => <NavigationLink key={link.href} link={link} pathname={pathname} />)}
    </nav>
    <p className="px-3 pt-5 text-xs leading-relaxed text-ink-subtle">Secure savings operations<br />Davchuks Daily Thrift</p>
  </>;
}

function NavigationLink({ link, pathname }: { link: AppNavigationItem; pathname: string }) {
  const active = isNavigationLinkActive(pathname, link.href);
  const { startNavigation } = useNavigationProgress();

  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        const opensCurrentTab =
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey;

        if (!active && opensCurrentTab) startNavigation();
      }}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand",
        active ? "bg-brand-soft text-brand-ink" : "text-ink-muted hover:bg-surface-hover hover:text-ink"
      )}
    >
      <NavIcon name={link.icon} />{link.label}
    </Link>
  );
}

function isNavigationLinkActive(pathname: string, href: string) {
  if (href === "/admin" || href === "/agent") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BrandMark() {
  return <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-solid text-sm font-black text-white shadow-sm">D</span>;
}

function MenuIcon() {
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>;
}

function NavIcon({ name }: { name: AppNavigationItem["icon"] }) {
  const paths: Record<AppNavigationItem["icon"], string> = {
    home: "M3 10 10 3l7 7v7H6a3 3 0 0 1-3-3v-4Z",
    people: "M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6-1a2.5 2.5 0 1 0 0-5M2 17a5 5 0 0 1 10 0m1-6a4 4 0 0 1 5 4",
    customer: "M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM3 18a7 7 0 0 1 14 0",
    tracking: "M3 4h14v13H3zM3 8h14M7 4v13",
    money: "M3 6h14v10H3zM6 10h.01M14 12h.01M10 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
    check: "M3 10l4 4L17 4M4 18h12",
    report: "M4 18V9m6 9V3m6 15v-6",
    audit: "M5 3h10v14H5zM8 7h4m-4 3h4m-4 3h2",
    settings: "M10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0-5v2m0 12v2M2 10h2m12 0h2M4.3 4.3l1.4 1.4m8.6 8.6 1.4 1.4m0-11.4-1.4 1.4m-8.6 8.6-1.4 1.4",
  };
  return <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true"><path d={paths[name]} /></svg>;
}
