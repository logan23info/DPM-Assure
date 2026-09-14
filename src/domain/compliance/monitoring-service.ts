import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions, requirePermission } from "@/auth/rbac";
import { complianceAlerts, sourceChangeImpacts } from "@/db/compliance-monitoring-schema";
import { recordDomainChange } from "@/domain/record-event";

function requireRationale(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 5) throw new Error("A meaningful rationale is required");
  return normalized;
}

export async function listComplianceAlerts(transaction: AuthorizedTenantTransaction) {
  requirePermission(transaction.membership.role, permissions.complianceRead);
  return transaction.db
    .select()
    .from(complianceAlerts)
    .where(eq(complianceAlerts.organizationId, transaction.context.organizationId))
    .orderBy(asc(complianceAlerts.status), asc(complianceAlerts.dueAt));
}

export async function refreshComplianceAlerts(
  transaction: AuthorizedTenantTransaction,
  asOf = new Date(),
) {
  requirePermission(transaction.membership.role, permissions.complianceMonitoringManage);

  const result = await transaction.db.execute(sql`
    select refresh_compliance_alerts(
      ${transaction.context.organizationId}::uuid,
      ${asOf}::timestamptz,
      ${transaction.principal.userId}::uuid
    ) as inserted_count
  `);

  await recordDomainChange(transaction, {
    eventType: "compliance.monitoring.refreshed",
    aggregateType: "organization",
    aggregateId: transaction.context.organizationId,
    action: "compliance.monitoring.refresh",
    entityType: "organization",
    entityId: transaction.context.organizationId,
    payload: { asOf: asOf.toISOString() },
    metadata: { deterministic: true, aiUsed: false, callerSuppliedDeadline: false },
  });

  return result;
}

export async function acknowledgeComplianceAlert(
  transaction: AuthorizedTenantTransaction,
  alertId: string,
) {
  requirePermission(transaction.membership.role, permissions.complianceMonitoringManage);

  const [updated] = await transaction.db
    .update(complianceAlerts)
    .set({
      status: "ACKNOWLEDGED",
      acknowledgedBy: transaction.principal.userId,
      acknowledgedAt: new Date(),
    })
    .where(and(
      eq(complianceAlerts.id, alertId),
      eq(complianceAlerts.organizationId, transaction.context.organizationId),
      eq(complianceAlerts.status, "OPEN"),
    ))
    .returning();
  if (!updated) throw new Error("Open compliance alert was not found in the authorized organization");

  await recordDomainChange(transaction, {
    eventType: "compliance.alert.acknowledged",
    aggregateType: "compliance_alert",
    aggregateId: updated.id,
    action: "compliance.alert.acknowledge",
    entityType: "compliance_alert",
    entityId: updated.id,
    payload: { alertId: updated.id, alertType: updated.alertType },
    newValues: { status: updated.status },
  });
  return updated;
}

export async function resolveComplianceAlert(
  transaction: AuthorizedTenantTransaction,
  alertId: string,
) {
  requirePermission(transaction.membership.role, permissions.complianceMonitoringManage);

  const [updated] = await transaction.db
    .update(complianceAlerts)
    .set({
      status: "RESOLVED",
      resolvedBy: transaction.principal.userId,
      resolvedAt: new Date(),
    })
    .where(and(
      eq(complianceAlerts.id, alertId),
      eq(complianceAlerts.organizationId, transaction.context.organizationId),
      eq(complianceAlerts.status, "ACKNOWLEDGED"),
    ))
    .returning();
  if (!updated) throw new Error("Acknowledged compliance alert was not found in the authorized organization");

  await recordDomainChange(transaction, {
    eventType: "compliance.alert.resolved",
    aggregateType: "compliance_alert",
    aggregateId: updated.id,
    action: "compliance.alert.resolve",
    entityType: "compliance_alert",
    entityId: updated.id,
    payload: { alertId: updated.id, alertType: updated.alertType },
    newValues: { status: updated.status },
  });
  return updated;
}

export async function listSourceChangeImpacts(transaction: AuthorizedTenantTransaction) {
  requirePermission(transaction.membership.role, permissions.complianceRead);
  return transaction.db
    .select()
    .from(sourceChangeImpacts)
    .where(eq(sourceChangeImpacts.organizationId, transaction.context.organizationId))
    .orderBy(asc(sourceChangeImpacts.status), asc(sourceChangeImpacts.createdAt));
}

export async function assessSourceChangeImpact(
  transaction: AuthorizedTenantTransaction,
  impactId: string,
  rationale: string,
) {
  requirePermission(transaction.membership.role, permissions.complianceMonitoringManage);
  const normalizedRationale = requireRationale(rationale);

  const [updated] = await transaction.db
    .update(sourceChangeImpacts)
    .set({
      status: "ASSESSED",
      rationale: normalizedRationale,
      assessedBy: transaction.principal.userId,
      assessedAt: new Date(),
    })
    .where(and(
      eq(sourceChangeImpacts.id, impactId),
      eq(sourceChangeImpacts.organizationId, transaction.context.organizationId),
      eq(sourceChangeImpacts.status, "OPEN"),
    ))
    .returning();
  if (!updated) throw new Error("Open source-change impact was not found in the authorized organization");

  await recordDomainChange(transaction, {
    eventType: "compliance.source_change_impact.assessed",
    aggregateType: "source_change_impact",
    aggregateId: updated.id,
    action: "compliance.source_change_impact.assess",
    entityType: "source_change_impact",
    entityId: updated.id,
    payload: { impactId: updated.id, sourceChangeEventId: updated.sourceChangeEventId },
    newValues: { status: updated.status, rationale: updated.rationale },
    metadata: { humanReviewed: true, aiUsed: false },
  });
  return updated;
}

export async function resolveSourceChangeImpact(
  transaction: AuthorizedTenantTransaction,
  impactId: string,
  rationale: string,
) {
  requirePermission(transaction.membership.role, permissions.complianceMonitoringManage);
  const normalizedRationale = requireRationale(rationale);

  const [updated] = await transaction.db
    .update(sourceChangeImpacts)
    .set({
      status: "RESOLVED",
      rationale: normalizedRationale,
      resolvedBy: transaction.principal.userId,
      resolvedAt: new Date(),
    })
    .where(and(
      eq(sourceChangeImpacts.id, impactId),
      eq(sourceChangeImpacts.organizationId, transaction.context.organizationId),
      eq(sourceChangeImpacts.status, "ASSESSED"),
    ))
    .returning();
  if (!updated) throw new Error("Assessed source-change impact was not found in the authorized organization");

  await recordDomainChange(transaction, {
    eventType: "compliance.source_change_impact.resolved",
    aggregateType: "source_change_impact",
    aggregateId: updated.id,
    action: "compliance.source_change_impact.resolve",
    entityType: "source_change_impact",
    entityId: updated.id,
    payload: { impactId: updated.id, sourceChangeEventId: updated.sourceChangeEventId },
    newValues: { status: updated.status, rationale: updated.rationale },
    metadata: { humanReviewed: true, aiUsed: false },
  });
  return updated;
}
