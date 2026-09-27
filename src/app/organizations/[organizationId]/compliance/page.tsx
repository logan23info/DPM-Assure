import { notFound, redirect } from "next/navigation";

import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { getCurrentUserContext } from "@/auth/current-user-context";
import { hasPermission, permissions } from "@/auth/rbac";
import {
  listApplicabilityDeterminations,
  listComplianceProfileFacts,
  listComplianceProfiles,
  listObligationRules,
  listOpenObligations,
} from "@/domain/compliance/service";
import { ComplianceClient, type CompliancePayload } from "./ComplianceClient";

export const dynamic = "force-dynamic";

export default async function CompliancePage({ params }: { params: Promise<{ organizationId: string }> }) {
  const current = await getCurrentUserContext();
  if (!current) redirect("/login");
  const { organizationId } = await params;
  const membership = current.memberships.find((item) => item.organizationId === organizationId);
  if (!membership || !hasPermission(membership.role, permissions.complianceRead)) notFound();
  const initialData = await withAuthorizedTenantTransaction(
    { principal: current.principal, organizationId, requestId: crypto.randomUUID(), permission: permissions.complianceRead },
    async (transaction) => ({
      profiles: await listComplianceProfiles(transaction),
      facts: await listComplianceProfileFacts(transaction),
      rules: await listObligationRules(transaction),
      determinations: await listApplicabilityDeterminations(transaction),
      obligations: await listOpenObligations(transaction),
    }),
  );

  return <main className="dashboard-shell">
    <header className="dashboard-header"><div><p className="eyebrow">{membership.organizationName}</p><h1>Compliance profiles</h1><p className="lede compact">Validated organization facts, deterministic applicability decisions, and source-derived deadlines.</p></div><span className="role-badge">SOURCE BACKED</span></header>
    <ComplianceClient organizationId={organizationId} canManage={hasPermission(membership.role, permissions.complianceProfileManage)} initialData={initialData as CompliancePayload} />
  </main>;
}
