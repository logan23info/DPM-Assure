import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { resolveCurrentUserContext } from "@/auth/current-user-context";
import { authorizeTenantTransaction } from "@/auth/authorize";
import { permissions } from "@/auth/rbac";
import { clients } from "@/db/schema";
import { NewEngagementClient } from "./NewEngagementClient";

export const dynamic = "force-dynamic";
type PageProps = { params: Promise<{ organizationId: string }> };

export default async function NewEngagementPage({ params }: PageProps) {
  const { organizationId } = await params;
  const current = await resolveCurrentUserContext(); if (!current) redirect("/login");
  const membership = current.memberships.find((item) => item.organizationId === organizationId); if (!membership) redirect("/dashboard");
  const clientRows = await authorizeTenantTransaction({ principal: { userId: current.user.id, email: current.user.email }, organizationId, requestId: crypto.randomUUID(), permission: permissions.engagementCreate }, async (tx) => tx.db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.organizationId, organizationId)));
  return <main className="shell"><section className="hero auth-card"><Link className="back-link" href={`/organizations/${organizationId}/engagements`}>← Engagements</Link><p className="eyebrow">Governed creation</p><h1>New engagement</h1><p className="lede compact">Every engagement begins in PLANNING. Governance gates must be satisfied before testing can start.</p>{clientRows.length === 0 && <div className="empty-state error"><strong>A client is required.</strong><p>Create a client record before opening an assurance engagement.</p></div>}<NewEngagementClient organizationId={organizationId} clients={clientRows} /></section></main>;
}
