import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions, requirePermission } from "@/auth/rbac";
import { engagementFrameworks, engagements, scopes } from "@/db/schema";
import { recordDomainChange } from "@/domain/record-event";
import {
  validateApplicabilityDecision,
  validateDefineScope,
  validateSelectFramework,
  type DecideApplicabilityInput,
  type DefineScopeInput,
  type SelectFrameworkInput,
} from "./scope-validation";

async function requirePlanning(transaction: AuthorizedTenantTransaction, engagementId: string) {
  const [row] = await transaction.db.select({ status: engagements.status }).from(engagements).where(and(eq(engagements.id, engagementId), eq(engagements.organizationId, transaction.context.organizationId))).limit(1);
  if (!row) throw new Error("Engagement not found");
  if (row.status !== "PLANNING") throw new Error("Framework, scope, and applicability can only be changed in PLANNING");
}

export async function selectEngagementFramework(transaction: AuthorizedTenantTransaction, input: SelectFrameworkInput) {
  requirePermission(transaction.membership.role, permissions.engagementGovernanceManage);
  const validated = validateSelectFramework(input); await requirePlanning(transaction, validated.engagementId);
  const [created] = await transaction.db.insert(engagementFrameworks).values({ engagementId: validated.engagementId, frameworkVersionId: validated.frameworkVersionId, applicabilityStatus: "SELECTED", reviewedBy: transaction.principal.userId, reviewedAt: new Date() }).onConflictDoNothing().returning();
  if (!created) throw new Error("Framework version is already selected");
  await transaction.db.execute(sql`update engagement_frameworks set organization_id=${transaction.context.organizationId}::uuid, selected_by=${transaction.principal.userId}::uuid where id=${created.id}::uuid`);
  await recordDomainChange(transaction, { eventType: "engagement.framework.selected", aggregateType: "engagement", aggregateId: validated.engagementId, action: "engagement.framework.select", entityType: "engagement_framework", entityId: created.id, payload: { frameworkVersionId: validated.frameworkVersionId }, newValues: { frameworkVersionId: validated.frameworkVersionId } });
  return created;
}

export async function defineEngagementScope(transaction: AuthorizedTenantTransaction, input: DefineScopeInput) {
  requirePermission(transaction.membership.role, permissions.engagementGovernanceManage);
  const validated = validateDefineScope(input); await requirePlanning(transaction, validated.engagementId);
  const [created] = await transaction.db.insert(scopes).values({ engagementId: validated.engagementId, name: validated.name, description: validated.description, inScope: validated.inScope, owner: transaction.principal.userId }).returning();
  if (!created) throw new Error("Scope write failed");
  await transaction.db.execute(sql`update scopes set organization_id=${transaction.context.organizationId}::uuid, scope_type=${validated.scopeType}, rationale=${validated.rationale} where id=${created.id}::uuid`);
  await recordDomainChange(transaction, { eventType: "engagement.scope.defined", aggregateType: "engagement", aggregateId: validated.engagementId, action: "engagement.scope.define", entityType: "scope", entityId: created.id, payload: { name: validated.name, scopeType: validated.scopeType, inScope: validated.inScope }, newValues: { name: validated.name, scopeType: validated.scopeType, inScope: validated.inScope, rationale: validated.rationale } });
  return created;
}

export async function decideRequirementApplicability(transaction: AuthorizedTenantTransaction, input: DecideApplicabilityInput) {
  requirePermission(transaction.membership.role, permissions.engagementGovernanceManage);
  const validated = validateApplicabilityDecision(input); await requirePlanning(transaction, validated.engagementId);
  const result = await transaction.db.execute<{ id: string; framework_version_id: string }>(sql`update engagement_requirement_applicability set decision=${validated.decision}::applicability_decision, rationale=${validated.rationale}, decided_by=${transaction.principal.userId}::uuid, decided_at=now(), updated_at=now() where organization_id=${transaction.context.organizationId}::uuid and engagement_id=${validated.engagementId}::uuid and requirement_id=${validated.requirementId}::uuid returning id, framework_version_id`);
  const row = result.rows[0]; if (!row) throw new Error("Requirement applicability row not found");
  await recordDomainChange(transaction, { eventType: "engagement.requirement.applicability_decided", aggregateType: "engagement", aggregateId: validated.engagementId, action: "engagement.requirement.decide_applicability", entityType: "engagement_requirement_applicability", entityId: row.id, payload: { requirementId: validated.requirementId, decision: validated.decision }, newValues: { decision: validated.decision, rationale: validated.rationale } });
  return row;
}

export async function getScopeReadiness(transaction: AuthorizedTenantTransaction, engagementId: string) {
  requirePermission(transaction.membership.role, permissions.engagementRead);
  const result = await transaction.db.execute<{ ready: boolean }>(sql`select engagement_scope_ready(${engagementId}::uuid) as ready`);
  return { ready: result.rows[0]?.ready === true };
}
