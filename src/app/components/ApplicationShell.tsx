"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

export type NavigationItem = {
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
  readonly exact?: boolean;
};

export type NavigationGroup = {
  readonly label: string;
  readonly items: readonly NavigationItem[];
};

export type IconName =
  | "ai"
  | "audit"
  | "bell"
  | "building"
  | "chevron"
  | "dashboard"
  | "evidence"
  | "findings"
  | "governance"
  | "menu"
  | "monitoring"
  | "privacy"
  | "report"
  | "scope"
  | "settings"
  | "testing"
  | "users"
  | "x";

type ApplicationShellProps = {
  readonly children: ReactNode;
  readonly email: string;
  readonly navigation: readonly NavigationGroup[];
  readonly organizationLabel?: string;
  readonly organizationMeta?: string;
  readonly roleLabel?: string;
};

const ICON_PATHS: Record<IconName, ReactNode> = {
  ai: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><path d="m5.6 5.6 2.1 2.1m8.6 8.6 2.1 2.1m0-12.8-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3"/></>,
  audit: <><path d="M5 3h14v18H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  building: <><path d="M4 21V6l8-3 8 3v15"/><path d="M8 9h2m4 0h2M8 13h2m4 0h2M8 17h2m4 0h2"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  evidence: <><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></>,
  findings: <><path d="M12 3 2.8 20h18.4z"/><path d="M12 9v4m0 3h.01"/></>,
  governance: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-5"/></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  monitoring: <><path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/><path d="M2 21h20"/></>,
  privacy: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  report: <><path d="M5 3h14v18H5z"/><path d="M8 16v-3m4 3V8m4 8v-5"/></>,
  scope: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  testing: <><path d="M9 3h6M10 3v5l-5 9a3 3 0 0 0 2.6 4h8.8a3 3 0 0 0 2.6-4l-5-9V3"/><path d="M8 15h8"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2"/><path d="M16 4a3 3 0 0 1 0 6m2 11v-2a6 6 0 0 0-3-5.2"/></>,
  x: <path d="m6 6 12 12M18 6 6 18"/>,
};

export function AppIcon({ name, size = 18 }: { readonly name: IconName; readonly size?: number }) {
  return <svg aria-hidden="true" className="app-icon" fill="none" height={size} viewBox="0 0 24 24" width={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">{ICON_PATHS[name]}</svg>;
}

function isActive(pathname: string, item: NavigationItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function ApplicationShell({ children, email, navigation, organizationLabel, organizationMeta, roleLabel }: ApplicationShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const engagementMatch = pathname.match(/^\/organizations\/([^/]+)\/engagements\/([^/]+)(?:\/|$)/);
  const engagementNavigation: NavigationGroup | null = engagementMatch && engagementMatch[2] !== "new" ? {
    label: "Active engagement",
    items: [
      { href: `/organizations/${engagementMatch[1]}/engagements/${engagementMatch[2]}`, label: "Governance", icon: "governance", exact: true },
      { href: `/organizations/${engagementMatch[1]}/engagements/${engagementMatch[2]}/scope`, label: "Framework & scope", icon: "scope" },
      { href: `/organizations/${engagementMatch[1]}/engagements/${engagementMatch[2]}/execution`, label: "Execution", icon: "testing", exact: true },
      { href: `/organizations/${engagementMatch[1]}/engagements/${engagementMatch[2]}/evidence`, label: "Evidence & testing", icon: "evidence" },
      { href: `/organizations/${engagementMatch[1]}/engagements/${engagementMatch[2]}/outcomes`, label: "Findings & remediation", icon: "findings" },
      { href: `/organizations/${engagementMatch[1]}/engagements/${engagementMatch[2]}/finalization`, label: "Review & reporting", icon: "report" },
      { href: `/organizations/${engagementMatch[1]}/engagements/${engagementMatch[2]}/postaudit`, label: "Post-audit monitoring", icon: "monitoring" },
    ],
  } : null;
  const effectiveNavigation = engagementNavigation ? [navigation[0]!, engagementNavigation, ...navigation.slice(1)] : navigation;
  const activeItem = effectiveNavigation.flatMap((group) => group.items).find((item) => isActive(pathname, item));
  const notificationHref = effectiveNavigation.flatMap((group) => group.items).find((item) => item.icon === "bell")?.href;
  const initial = (email || "U").charAt(0).toUpperCase();

  const sidebar = (
    <div className="app-sidebar-inner">
      <div className="app-brand">
        <span className="app-brand-mark"><AppIcon name="governance" size={19}/></span>
        {!collapsed ? <span><strong>DPM-Assure</strong><small>Privacy assurance</small></span> : null}
      </div>

      {organizationLabel && !collapsed ? (
        <div className="app-context">
          <span>Active organization</span>
          <strong>{organizationLabel}</strong>
          <small>{organizationMeta}</small>
        </div>
      ) : null}

      <nav aria-label="Workspace navigation" className="app-navigation">
        {effectiveNavigation.map((group) => (
          <div className="app-nav-group" key={group.label}>
            {!collapsed ? <span className="app-nav-label">{group.label}</span> : null}
            {group.items.map((item) => {
              const active = isActive(pathname, item);
              return <Link aria-current={active ? "page" : undefined} className={`app-nav-link${active ? " active" : ""}`} href={item.href} key={item.href} onClick={() => setMobileOpen(false)} title={collapsed ? item.label : undefined}><AppIcon name={item.icon}/>{!collapsed ? <span>{item.label}</span> : null}</Link>;
            })}
          </div>
        ))}
      </nav>

      <div className="app-user">
        <span className="app-avatar">{initial}</span>
        {!collapsed ? <span className="app-user-copy"><strong>{email}</strong><small>{roleLabel ?? "Authenticated user"}</small></span> : null}
        <form action="/api/auth/logout" method="post"><button aria-label="Sign out" className="app-signout" title="Sign out" type="submit">↗</button></form>
      </div>
    </div>
  );

  return (
    <div className={`app-frame${collapsed ? " is-collapsed" : ""}`}>
      <aside className="app-sidebar">{sidebar}</aside>
      {mobileOpen ? <div className="app-mobile-layer"><aside className="app-mobile-sidebar">{sidebar}</aside><button aria-label="Close navigation" className="app-mobile-backdrop" onClick={() => setMobileOpen(false)} type="button"/></div> : null}
      <div className="app-stage">
        <header className="app-topbar">
          <div className="app-topbar-leading">
            <button aria-label="Open navigation" className="app-menu-button mobile-only" onClick={() => setMobileOpen(true)} type="button"><AppIcon name="menu"/></button>
            <button aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} className="app-menu-button desktop-only" onClick={() => setCollapsed((value) => !value)} type="button"><AppIcon name={collapsed ? "menu" : "chevron"}/></button>
            <div><span className="app-topbar-kicker">Workspace</span><strong>{activeItem?.label ?? organizationLabel ?? "DPM-Assure"}</strong></div>
          </div>
          <div className="app-topbar-actions">
            {roleLabel ? <span className="app-role-chip">{roleLabel.replaceAll("_", " ")}</span> : null}
            {notificationHref ? <Link aria-label="Notifications" className="app-icon-button" href={notificationHref}><AppIcon name="bell"/></Link> : null}
          </div>
        </header>
        <div className="app-progress" aria-hidden="true"><span/><span/><span/><span/><span/><span/></div>
        <div className="app-content">{children}</div>
      </div>
    </div>
  );
}
