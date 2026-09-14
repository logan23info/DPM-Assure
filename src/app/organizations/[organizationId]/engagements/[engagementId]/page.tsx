import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { getCurrentUserContext } from "@/auth/current-user-context";
import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions } from "@/auth/rbac";
import { getGovernanceReadiness } from "@/domain/engagement/governance-service";
import { getScopeReadiness } from "@/domain/engagement/scope-service";
import { GovernanceClient } from "./GovernanceClient";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ organizationId: string; engagementId: string }> };

export default async function EngagementGovernancePage({ params }: PageProps) {
  const { organizationId, engagementId } = await params;
  const current = await getCurrentUserContext(); if (!current) redirect("/login");
  const membership = current.memberships.find((item) => item.organizationId === organizationId); if (!membership) redirect("/dashboard");

  const snapshot = await withAuthorizedTenantTransaction({ principal: current.principal, organizationId, requestId: crypto.randomUUID(), permission: permissions.engagementRead }, async (tx) => {
    const engagement = await tx.db.execute<{ id: string; name: string; description: string | null; status: string; start_date: string | null; end_date: string | null }>(sql`select id,name,description,status::text,start_date::text,end_date::text from engagements where id=${engagementId}::uuid and organization_id=${organizationId}::uuid`);
    if (!engagement.rows[0]) throw new Error("Engagement not found");
    const assignees = await tx.db.execute<{ user_id: string; email: string; display_name: string | null; role: string }>(sql`select m.user_id,u.email,u.display_name,m.role::text from memberships m join users u on u.id=m.user_id where m.organization_id=${organizationId}::uuid and m.status='ACTIVE' and m.role in ('AUDIT_MANAGER','LEAD_AUDITOR','AUDITOR','REVIEWER') order by u.email`);
    const assignments = await tx.db.execute<{ id: string; user_id: string; email: string; role: string; active: boolean }>(sql`select ea.id,ea.user_id,u.email,ea.assignment_role::text as role,ea.active from engagement_assignments ea join users u on u.id=ea.user_id where ea.engagement_id=${engagementId}::uuid order by ea.active desc,u.email`);
    const checks = await tx.db.execute<{ id: string; subject_user_id: string; email: string; result: string; conflict_details: string | null; resolved_at: string | null }>(sql`select ic.id,ic.subject_user_id,u.email,ic.result,ic.conflict_details,ic.resolved_at::text from independence_checks ic join users u on u.id=ic.subject_user_id where ic.engagement_id=${engagementId}::uuid order by ic.created_at desc`);
    const risks = await tx.db.execute<{ id: string; method_version: string; inherent_score: string | null; control_score: string | null; residual_score: string | null; rationale: string; assessed_at: string }>(sql`select id,method_version,inherent_score::text,control_score::text,residual_score::text,rationale,assessed_at::text from risk_assessments where engagement_id=${engagementId}::uuid order by assessed_at desc limit 5`);
    const plans = await tx.db.execute<{ id: string; version: number; status: string; objectives: string; created_by: string; approved_by: string | null }>(sql`select id,version,status::text,objectives,created_by,approved_by from audit_plans where engagement_id=${engagementId}::uuid order by version desc`);
    const governanceReadiness = await getGovernanceReadiness(tx, engagementId);
    const scopeReadiness = await getScopeReadiness(tx, engagementId);
    return { engagement: engagement.rows[0], assignees: assignees.rows, assignments: assignments.rows, checks: checks.rows, risks: risks.rows, plans: plans.rows, governanceReady: governanceReadiness.ready, scopeReady: scopeReadiness.ready, ready: governanceReadiness.ready && scopeReadiness.ready };
  });

  return <main className="dashboard-shell"><Link className="back-link" href={`/organizations/${organizationId}/engagements`}>← Engagements</Link><header className="dashboard-header"><div><p className="eyebrow">Engagement governance</p><h1>{snapshot.engagement.name}</h1><p className="lede compact">{snapshot.engagement.description ?? "No description"}</p><div className="header-meta"><Link className="secondary-link" href={`/organizations/${organizationId}/engagements/${engagementId}/scope`}>Framework & scope</Link>{snapshot.engagement.status === "TESTING" ? <Link className="secondary-link" href={`/organizations/${organizationId}/engagements/${engagementId}/execution`}>Execution workspace</Link> : null}</div></div><span className="role-badge">{snapshot.engagement.status}</span></header>
    <section className="monitoring-summary"><article><strong>{snapshot.assignments.filter((item) => item.active).length}</strong><span>Active assignees</span></article><article><strong>{snapshot.checks.filter((item) => item.result === "CONFLICT" && !item.resolved_at).length}</strong><span>Open conflicts</span></article><article><strong>{snapshot.governanceReady ? "Yes" : "No"}</strong><span>Governance ready</span></article><article><strong>{snapshot.scopeReady ? "Yes" : "No"}</strong><span>Scope ready</span></article></section>
    {snapshot.risks.length > 0 ? <section className="workspace-panel"><div className="section-heading"><div><p className="eyebrow">Risk history</p><h2>Recent preliminary assessments</h2></div></div><div className="signal-list">{snapshot.risks.map((risk) => <article className="signal-card" key={risk.id}><div className="signal-meta"><span>{risk.method_version}</span><span>{new Date(risk.assessed_at).toLocaleString()}</span></div><p>{risk.rationale}</p><small>Inherent {risk.inherent_score ?? "—"} · Control {risk.control_score ?? "—"} · Residual {risk.residual_score ?? "—"}</small></article>)}</div></section> : null}
    <GovernanceClient organizationId={organizationId} engagementId={engagementId} status={snapshot.engagement.status} ready={snapshot.ready} assignees={snapshot.assignees.map((item) => ({ userId: item.user_id, email: item.email, displayName: item.display_name, role: item.role }))} assignments={snapshot.assignments.map((item) => ({ id: item.id, userId: item.user_id, email: item.email, role: item.role, active: item.active }))} checks={snapshot.checks.map((item) => ({ id: item.id, subjectUserId: item.subject_user_id, email: item.email, result: item.result, conflictDetails: item.conflict_details, resolvedAt: item.resolved_at }))} plans={snapshot.plans.map((item) => ({ id: item.id, version: item.version, status: item.status, objectives: item.objectives, createdBy: item.created_by, approvedBy: item.approved_by }))} />
  </main>;
}
