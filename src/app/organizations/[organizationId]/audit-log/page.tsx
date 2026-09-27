import { notFound, redirect } from "next/navigation";

import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { getCurrentUserContext } from "@/auth/current-user-context";
import { hasPermission, permissions } from "@/auth/rbac";
import { listAuditLog } from "@/domain/audit/service";

export const dynamic = "force-dynamic";

export default async function AuditLogPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const current = await getCurrentUserContext();
  if (!current) redirect("/login");
  const { organizationId } = await params;
  const membership = current.memberships.find((item) => item.organizationId === organizationId);
  if (!membership || !hasPermission(membership.role, permissions.auditLogRead)) notFound();

  const entries = await withAuthorizedTenantTransaction(
    { principal: current.principal, organizationId, requestId: crypto.randomUUID(), permission: permissions.auditLogRead },
    (transaction) => listAuditLog(transaction),
  );

  return <main className="dashboard-shell">
    <header className="dashboard-header"><div><p className="eyebrow">{membership.organizationName}</p><h1>Audit history</h1><p className="lede compact">Append-only governance actions with actor, entity, request, and recorded outcome.</p></div><span className="role-badge">{entries.length} EVENTS</span></header>
    <section className="workspace-panel">
      <div className="section-heading"><div><p className="eyebrow">Traceability</p><h2>Recent governed changes</h2></div></div>
      <div className="signal-list">{entries.length ? entries.map((entry) => <article className="signal-card" key={entry.id}>
        <div className="signal-meta"><span className="role-badge">{entry.action}</span><span>{new Date(entry.timestamp).toLocaleString()}</span></div>
        <h3>{entry.entity_type.replaceAll("_", " ")}</h3>
        <p>{entry.actor_email ?? "System actor"} · entity {entry.entity_id ?? "organization"}</p>
        <small>Request {entry.request_id}</small>
        {entry.new_values ? <pre className="code-block">{JSON.stringify(entry.new_values, null, 2)}</pre> : null}
      </article>) : <div className="empty-state">No governed changes have been recorded.</div>}</div>
    </section>
  </main>;
}
