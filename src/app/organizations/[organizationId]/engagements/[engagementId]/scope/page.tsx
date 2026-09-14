import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { getCurrentUserContext } from "@/auth/current-user-context";
import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions } from "@/auth/rbac";
import { getScopeReadiness } from "@/domain/engagement/scope-service";
import { ScopeClient } from "./ScopeClient";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ organizationId: string; engagementId: string }> };

export default async function EngagementScopePage({ params }: PageProps) {
  const { organizationId, engagementId } = await params;
  const current = await getCurrentUserContext(); if (!current) redirect("/login");
  const membership = current.memberships.find((item) => item.organizationId === organizationId); if (!membership) redirect("/dashboard");
  const snapshot = await withAuthorizedTenantTransaction({ principal: current.principal, organizationId, requestId: crypto.randomUUID(), permission: permissions.engagementRead }, async (tx) => {
    const engagement = await tx.db.execute<{ id: string; name: string; status: string }>(sql`select id,name,status::text from engagements where id=${engagementId}::uuid and organization_id=${organizationId}::uuid`);
    if (!engagement.rows[0]) throw new Error("Engagement not found");
    const frameworkOptions = await tx.db.execute<{ id: string; framework_name: string; version: string; status: string }>(sql`select fv.id,f.name as framework_name,fv.version,fv.status::text from framework_versions fv join frameworks f on f.id=fv.framework_id where fv.status='ACTIVE' and f.status='ACTIVE' order by f.name,fv.version`);
    const selectedFrameworks = await tx.db.execute<{ id: string; framework_version_id: string; framework_name: string; version: string }>(sql`select ef.id,ef.framework_version_id,f.name as framework_name,fv.version from engagement_frameworks ef join framework_versions fv on fv.id=ef.framework_version_id join frameworks f on f.id=fv.framework_id where ef.engagement_id=${engagementId}::uuid and ef.organization_id=${organizationId}::uuid order by f.name,fv.version`);
    const scopes = await tx.db.execute<{ id: string; name: string; scope_type: string; in_scope: boolean; rationale: string | null }>(sql`select id,name,scope_type,in_scope,rationale from scopes where engagement_id=${engagementId}::uuid and organization_id=${organizationId}::uuid order by created_at`);
    const requirements = await tx.db.execute<{ id: string; code: string; title: string; decision: string; rationale: string | null }>(sql`select a.requirement_id as id,r.requirement_key as code,r.title,a.decision::text,a.rationale from engagement_requirement_applicability a join requirements r on r.id=a.requirement_id where a.engagement_id=${engagementId}::uuid and a.organization_id=${organizationId}::uuid order by r.requirement_key`);
    const readiness = await getScopeReadiness(tx, engagementId);
    return { engagement: engagement.rows[0], frameworkOptions: frameworkOptions.rows, selectedFrameworks: selectedFrameworks.rows, scopes: scopes.rows, requirements: requirements.rows, ready: readiness.ready };
  });
  return <main className="dashboard-shell"><Link className="back-link" href={`/organizations/${organizationId}/engagements/${engagementId}`}>← Engagement governance</Link><header className="dashboard-header"><div><p className="eyebrow">Framework & scope</p><h1>{snapshot.engagement.name}</h1><p className="lede compact">Select source-backed framework versions, define audit boundaries, and explicitly decide requirement applicability.</p></div><span className="role-badge">{snapshot.engagement.status}</span></header>
    <section className="monitoring-summary"><article><strong>{snapshot.selectedFrameworks.length}</strong><span>Selected framework versions</span></article><article><strong>{snapshot.scopes.filter((item) => item.in_scope).length}</strong><span>In-scope boundaries</span></article><article><strong>{snapshot.requirements.filter((item) => item.decision === "PENDING").length}</strong><span>Pending applicability decisions</span></article></section>
    {snapshot.selectedFrameworks.length ? <section className="workspace-panel"><div className="section-heading"><div><p className="eyebrow">Selected versions</p><h2>Frozen framework references</h2></div></div><div className="signal-list">{snapshot.selectedFrameworks.map((item) => <article className="signal-card" key={item.id}><strong>{item.framework_name}</strong><p>Version {item.version}</p></article>)}</div></section> : null}
    {snapshot.scopes.length ? <section className="workspace-panel"><div className="section-heading"><div><p className="eyebrow">Scope register</p><h2>Audit boundaries</h2></div></div><div className="signal-list">{snapshot.scopes.map((item) => <article className="signal-card" key={item.id}><div className="signal-meta"><span>{item.scope_type}</span><span>{item.in_scope ? "IN SCOPE" : "OUT OF SCOPE"}</span></div><h3>{item.name}</h3><p>{item.rationale}</p></article>)}</div></section> : null}
    <ScopeClient organizationId={organizationId} engagementId={engagementId} status={snapshot.engagement.status} ready={snapshot.ready} frameworkOptions={snapshot.frameworkOptions.map((item) => ({ id: item.id, frameworkName: item.framework_name, version: item.version, status: item.status }))} requirements={snapshot.requirements} />
  </main>;
}
