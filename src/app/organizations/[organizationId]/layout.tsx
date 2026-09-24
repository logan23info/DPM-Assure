import { redirect } from "next/navigation";

import { getCurrentUserContext } from "@/auth/current-user-context";
import { hasPermission, permissions } from "@/auth/rbac";
import { ApplicationShell, type NavigationGroup } from "@/app/components/ApplicationShell";

type LayoutProps = Readonly<{
  children: React.ReactNode;
  params: Promise<{ organizationId: string }>;
}>;

export default async function OrganizationLayout({ children, params }: LayoutProps) {
  const { organizationId } = await params;
  const current = await getCurrentUserContext();
  if (!current) redirect("/login");

  const membership = current.memberships.find((item) => item.organizationId === organizationId);
  // Invitation acceptance lives under the same organization segment and is
  // intentionally reachable before the new membership becomes active.
  if (!membership) return children;

  const root = `/organizations/${organizationId}`;
  const isClient = membership.role === "CLIENT";
  const navigation: NavigationGroup[] = isClient ? [
    { label: "Workspace", items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true },
      { href: `${root}/client-portal`, label: "Evidence requests", icon: "evidence" },
      { href: `${root}/notifications`, label: "Notifications", icon: "bell" },
    ] },
  ] : [
    { label: "Workspace", items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true },
      { href: `${root}/engagements`, label: "Engagements", icon: "audit", exact: true },
    ] },
    { label: "Privacy assurance", items: [
      { href: `${root}/privacy`, label: "Privacy operations", icon: "privacy" },
      { href: `${root}/compliance/monitoring`, label: "Compliance monitoring", icon: "monitoring" },
      { href: `${root}/notifications`, label: "Notifications", icon: "bell" },
    ] },
    ...(hasPermission(membership.role, permissions.aiUse) ? [{ label: "Advisory", items: [
      { href: `${root}/ai`, label: "AI assistance", icon: "ai" as const },
    ] }] : []),
    ...(["ORG_ADMIN", "SUPER_ADMIN"].includes(membership.role) ? [{ label: "Administration", items: [
      { href: `${root}/members`, label: "Members & roles", icon: "users" as const },
      { href: `${root}/client-access`, label: "Client portal access", icon: "settings" as const },
    ] }] : []),
  ];

  return (
    <ApplicationShell
      email={current.principal.email ?? current.principal.userId}
      navigation={navigation}
      organizationLabel={membership.organizationName}
      organizationMeta={membership.organizationSlug}
      roleLabel={membership.role}
    >
      {children}
    </ApplicationShell>
  );
}
