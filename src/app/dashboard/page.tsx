import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUserContext } from "@/auth/current-user-context";
import { hasPermission, permissions } from "@/auth/rbac";
import { ApplicationShell, type NavigationGroup } from "@/app/components/ApplicationShell";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const current = await getCurrentUserContext();
  if (!current) redirect("/login");
  const email = current.principal.email ?? current.principal.userId;
  const clientOrganizations = current.memberships.filter((membership) => membership.role === "CLIENT").length;
  const adminOrganizations = current.memberships.filter((membership) => membership.role === "ORG_ADMIN" || membership.role === "SUPER_ADMIN").length;
  const assuranceOrganizations = current.memberships.length - clientOrganizations;
  const navigation: NavigationGroup[] = [
    { label: "Workspace", items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true }] },
    ...(current.memberships.length > 0 ? [{ label: "Organizations", items: current.memberships.map((membership) => ({
      href: membership.role === "CLIENT" ? `/organizations/${membership.organizationId}/client-portal` : `/organizations/${membership.organizationId}/engagements`,
      label: membership.organizationName,
      icon: "building" as const,
    })) }] : []),
  ];

  return <ApplicationShell email={email} navigation={navigation}><main className="dashboard-shell hub-dashboard">
    <header className="dashboard-header"><div><p className="eyebrow">DPM-Assure</p><h1>Welcome back</h1><p className="lede compact">Select an authorized organization and continue your governed assurance work.</p></div><div className="signed-in-chip"><span>{email.charAt(0).toUpperCase()}</span><div><strong>{email}</strong><small>Authenticated workspace</small></div></div></header>
    <section aria-label="Workspace summary" className="workspace-stats">
      <article><span>Authorized organizations</span><strong>{current.memberships.length}</strong><small>Tenant-scoped memberships</small></article>
      <article><span>Assurance workspaces</span><strong>{assuranceOrganizations}</strong><small>Auditor and reviewer access</small></article>
      <article><span>Administration</span><strong>{adminOrganizations}</strong><small>Organization admin roles</small></article>
      <article><span>Client portals</span><strong>{clientOrganizations}</strong><small>Explicit evidence access</small></article>
    </section>
    <section className="workspace-panel"><div className="section-heading"><div><p className="eyebrow">Authorized organizations</p><h2>Select an organization</h2></div><span className="count-badge">{current.memberships.length}</span></div>{current.memberships.length===0?<div className="empty-state"><strong>No active organization membership</strong><p>Your account is valid, but no active tenant membership is assigned. An organization administrator must grant access.</p></div>:<div className="organization-grid">{current.memberships.map(membership=>{const canManageUsers=membership.role==="ORG_ADMIN"||membership.role==="SUPER_ADMIN";const isClient=membership.role==="CLIENT";const canUseAi=hasPermission(membership.role,permissions.aiUse);return <article className="organization-card organization-launch-card" key={membership.organizationId}><div className="organization-card-heading"><span className="organization-mark">{membership.organizationName.charAt(0).toUpperCase()}</span><div><span className="role-badge">{membership.role.replaceAll("_"," ")}</span><h3>{membership.organizationName}</h3><p>{membership.organizationSlug}</p></div></div><div className="card-actions">{isClient?<Link className="primary-link" href={`/organizations/${membership.organizationId}/client-portal`}>Open client evidence requests <span>→</span></Link>:<><Link className="primary-link" href={`/organizations/${membership.organizationId}/engagements`}>Open assurance engagements <span>→</span></Link><div className="card-quick-links"><Link href={`/organizations/${membership.organizationId}/privacy`}>Privacy operations</Link><Link href={`/organizations/${membership.organizationId}/compliance/monitoring`}>Monitoring</Link><Link href={`/organizations/${membership.organizationId}/notifications`}>Notifications</Link>{canUseAi?<Link href={`/organizations/${membership.organizationId}/ai`}>AI assistance</Link>:null}{canManageUsers?<Link href={`/organizations/${membership.organizationId}/members`}>Members</Link>:null}</div></>} </div></article>})}</div>}</section>
    <section className="mode-grid" aria-label="Assurance lifecycle"><article className="mode-card plan"><span className="mode-icon">01</span><div><strong>Plan & govern</strong><p>Independence, preliminary risk, plan approval, framework selection and scope.</p></div></article><article className="mode-card execute"><span className="mode-icon">02</span><div><strong>Execute & evidence</strong><p>Sampling, workpapers, PBC requests, evidence gates and controlled testing.</p></div></article><article className="mode-card report"><span className="mode-icon">03</span><div><strong>Review & monitor</strong><p>Findings, remediation, sign-off, reporting and continuous compliance.</p></div></article></section>
  </main></ApplicationShell>;
}
