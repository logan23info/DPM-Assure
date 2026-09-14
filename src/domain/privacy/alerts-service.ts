import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions, requirePermission } from "@/auth/rbac";
import { privacyAlerts } from "@/db/privacy-alert-schema";
import { recordDomainChange } from "@/domain/record-event";

export async function listPrivacyAlerts(
  transaction: AuthorizedTenantTransaction,
) {
  requirePermission(transaction.membership.role, permissions.privacyRead);

  return transaction.db
    .select()
    .from(privacyAlerts)
    .where(eq(privacyAlerts.organizationId, transaction.context.organizationId))
    .orderBy(asc(privacyAlerts.dueAt));
}

export async function refreshPrivacyAlerts(
  transaction: AuthorizedTenantTransaction,
  asOf = new Date(),
): Promise<number> {
  requirePermission(transaction.membership.role, permissions.privacyAlertsManage);

  const result = await transaction.db.execute<{ created_count: number }>(sql`
    select refresh_privacy_alerts(
      ${transaction.context.organizationId}::uuid,
      ${asOf}::timestamptz
    ) as created_count
  `);
  const createdCount = Number(result.rows[0]?.created_count ?? 0);

  await recordDomainChange(transaction, {
    eventType: "privacy.alerts.refreshed",
    aggregateType: "organization",
    aggregateId: transaction.context.organizationId,
    action: "privacy.alerts.refresh",
    entityType: "organization",
    payload: {
      organizationId: transaction.context.organizationId,
      asOf: asOf.toISOString(),
      createdCount,
    },
    metadata: {
      statutoryDeadlinesInvented: false,
      source: "explicit_due_and_review_dates",
    },
  });

  return createdCount;
}

export async function acknowledgePrivacyAlert(
  transaction: AuthorizedTenantTransaction,
  alertId: string,
) {
  requirePermission(transaction.membership.role, permissions.privacyAlertsManage);

  const [candidate] = await transaction.db
    .select()
    .from(privacyAlerts)
    .where(and(
      eq(privacyAlerts.id, alertId),
      eq(privacyAlerts.organizationId, transaction.context.organizationId),
    ))
    .limit(1);
  if (!candidate) throw new Error("Privacy alert was not found in the authorized organization");
  if (candidate.status === "RESOLVED") throw new Error("Resolved privacy alerts cannot be acknowledged or reopened");
  if (candidate.status === "ACKNOWLEDGED") return candidate;

  const [updated] = await transaction.db
    .update(privacyAlerts)
    .set({
      status: "ACKNOWLEDGED",
      acknowledgedBy: transaction.principal.userId,
      acknowledgedAt: new Date(),
    })
    .where(eq(privacyAlerts.id, candidate.id))
    .returning();
  if (!updated) throw new Error("Privacy alert acknowledgement did not return a row");

  await recordDomainChange(transaction, {
    eventType: "privacy.alert.acknowledged",
    aggregateType: "privacy_alert",
    aggregateId: updated.id,
    action: "privacy.alert.acknowledge",
    entityType: "privacy_alert",
    oldValues: { status: candidate.status },
    newValues: { status: updated.status, acknowledgedBy: updated.acknowledgedBy },
    payload: {
      alertId: updated.id,
      recordType: updated.recordType,
      recordId: updated.recordId,
      severity: updated.severity,
    },
  });

  return updated;
}

export async function resolvePrivacyAlert(
  transaction: AuthorizedTenantTransaction,
  alertId: string,
) {
  requirePermission(transaction.membership.role, permissions.privacyAlertsManage);

  const [candidate] = await transaction.db
    .select()
    .from(privacyAlerts)
    .where(and(
      eq(privacyAlerts.id, alertId),
      eq(privacyAlerts.organizationId, transaction.context.organizationId),
    ))
    .limit(1);
  if (!candidate) throw new Error("Privacy alert was not found in the authorized organization");
  if (candidate.status === "RESOLVED") return candidate;

  const [updated] = await transaction.db
    .update(privacyAlerts)
    .set({
      status: "RESOLVED",
      resolvedBy: transaction.principal.userId,
      resolvedAt: new Date(),
    })
    .where(eq(privacyAlerts.id, candidate.id))
    .returning();
  if (!updated) throw new Error("Privacy alert resolution did not return a row");

  await recordDomainChange(transaction, {
    eventType: "privacy.alert.resolved",
    aggregateType: "privacy_alert",
    aggregateId: updated.id,
    action: "privacy.alert.resolve",
    entityType: "privacy_alert",
    oldValues: { status: candidate.status },
    newValues: { status: updated.status, resolvedBy: updated.resolvedBy },
    payload: {
      alertId: updated.id,
      recordType: updated.recordType,
      recordId: updated.recordId,
      severity: updated.severity,
    },
  });

  return updated;
}
