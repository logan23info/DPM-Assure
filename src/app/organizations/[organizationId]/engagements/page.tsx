import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUserContext } from "@/auth/current-user-context";
import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions } from "@/auth/rbac";
import { listEngagements } from "@/domain/engagement/service";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ organizationId: string }> };

export default async function EngagementsPage({ params }: PageProps) {
  const { organizationId } = await params;
  const current = await getCurrentUserContext(); if (!current) redirect("/login");
  const membership = current.memberships.find((item) => item.organizationId === organizationId); if (!membership) redirect("/dashboard");
  const engagements = await withAuthorizedTenantTransaction({ principal: current.principal, organizationId, requestId: crypto.randomUUID(), permission: permissions.engagementRead }, listEngagements);
  return <main className="dashboard-shell"><Link className="back-link" href="/dashboard">← Dashboard</Link><header className="dashboard-header"><div><p className="eyebrow">Assurance workspace</p><h1>Engagements</h1><p className="lede compact">{membership.organizationName} · {membership.role.replaceAll("_", " ")}</p></div><Link className="primary-link" href={`/organizations/${organizationId}/engagements/new`}>New engagement</Link></header><section className="workspace-panel"><div className="section-heading"><h2>Audit engagements</h2><span className="count-badge">{engagements.length}</span></div>{engagements.length === 0 ? <div className="empty-state"><strong>No engagements yet.</strong><p>Create the first governed assurance engagement for this organization.</p></div> : <div className="organization-grid">{engagements.map((engagement) => <article className="organization-card" key={engagement.id}><div><span className="role-badge">{engagement.status}</span><h3>{engagement.name}</h3><p>{engagement.description ?? "No description"}</p></div><Link className="primary-link" href={`/organizations/${organizationId}/engagements/${engagement.id}`}>Open engagement</Link></article>)}</div>}</section></main>;
}
