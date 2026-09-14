import Link from "next/link";
import { redirect } from "next/navigation";

import { resolveCurrentUserContext } from "@/auth/current-user-context";
import { withAuthorizedTenantTransaction } from "@/auth/authorize";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ organizationId: string }> };

export default async function EngagementsPage({ params }: PageProps) {
  const { organizationId } = await params;
  const current = await resolveCurrentUserContext();
  if (!current) redirect("/login");

  const membership = current.memberships.find((item) => item.organizationId === organizationId);
  if (!membership) redirect("/dashboard");

  const engagements = await withAuthorizedTenantTransaction(
    { userId: current.user.id, organizationId, requestId: crypto.randomUUID() },
    "engagement.read",
    async (tx) => {
      const result = await tx.execute(`SELECT id, name, status::text, created_at, frozen_at FROM engagements WHERE organization_id = '${organizationId}'::uuid ORDER BY created_at DESC`);
      return result.rows as Array<{ id: string; name: string; status: string; created_at: Date; frozen_at: Date | null }>;
    },
  );

  return (
    <main className="dashboard-shell">
      <Link className="back-link" href="/dashboard">← Dashboard</Link>
      <header className="dashboard-header">
        <div><p className="eyebrow">Assurance workspace</p><h1>Engagements</h1><p className="lede compact">{membership.organizationName} · {membership.role.replaceAll("_", " ")}</p></div>
        <Link className="primary-link" href={`/organizations/${organizationId}/engagements/new`}>New engagement</Link>
      </header>
      <section className="workspace-panel">
        <div className="section-heading"><h2>Audit engagements</h2><span className="count-badge">{engagements.length}</span></div>
        {engagements.length === 0 ? <div className="empty-state"><strong>No engagements yet.</strong><p>Create the first governed assurance engagement for this organization.</p></div> : (
          <div className="organization-grid">{engagements.map((engagement) => <article className="organization-card" key={engagement.id}><div><span className="role-badge">{engagement.status}</span><h3>{engagement.name}</h3><p>Created {new Date(engagement.created_at).toLocaleDateString()}</p></div><Link className="primary-link" href={`/organizations/${organizationId}/engagements/${engagement.id}`}>Open engagement</Link></article>)}</div>
        )}
      </section>
    </main>
  );
}
