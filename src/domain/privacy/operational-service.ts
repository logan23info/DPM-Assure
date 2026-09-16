import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions, requirePermission } from "@/auth/rbac";
import {
  consentRecords,
  privacyNotices,
  processingActivities,
  retentionRules,
} from "@/db/privacy-schema";
import { recordDomainChange } from "@/domain/record-event";

const SHA256 = /^[0-9a-f]{64}$/;

function text(value: string, field: string, max = 10_000) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  if (normalized.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return normalized;
}

function hash(value: string, field: string) {
  if (!SHA256.test(value)) throw new Error(`${field} must be a lowercase SHA-256 digest`);
  return value;
}

function timestamp(value: string, field: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} must be a valid date-time`);
  return parsed;
}

async function requireActivity(transaction: AuthorizedTenantTransaction, activityId: string) {
  const [activity] = await transaction.db.select({ id: processingActivities.id }).from(processingActivities).where(and(
    eq(processingActivities.id, activityId),
    eq(processingActivities.organizationId, transaction.context.organizationId),
  )).limit(1);
  if (!activity) throw new Error("Processing activity was not found in the authorized organization");
}

export async function createRetentionRule(transaction: AuthorizedTenantTransaction, input: {
  processingActivityId: string;
  dataCategory: string;
  retentionPeriod: string;
  triggerEvent: string;
  disposalMethod?: string;
  legalBasisReference?: string;
}) {
  requirePermission(transaction.membership.role, permissions.privacyManage);
  await requireActivity(transaction, input.processingActivityId);
  const [created] = await transaction.db.insert(retentionRules).values({
    organizationId: transaction.context.organizationId,
    processingActivityId: input.processingActivityId,
    dataCategory: text(input.dataCategory, "dataCategory", 300),
    retentionPeriod: text(input.retentionPeriod, "retentionPeriod", 500),
    triggerEvent: text(input.triggerEvent, "triggerEvent", 500),
    ...(input.disposalMethod?.trim() ? { disposalMethod: text(input.disposalMethod, "disposalMethod", 500) } : {}),
    ...(input.legalBasisReference?.trim() ? { legalBasisReference: text(input.legalBasisReference, "legalBasisReference", 2_000) } : {}),
    createdBy: transaction.principal.userId,
  }).returning();
  if (!created) throw new Error("Retention rule insert did not return a row");
  await recordDomainChange(transaction, {
    eventType: "privacy.retention_rule.created", aggregateType: "retention_rule", aggregateId: created.id,
    action: "privacy.retention_rule.create", entityType: "retention_rule",
    payload: { retentionRuleId: created.id, processingActivityId: created.processingActivityId },
    newValues: { dataCategory: created.dataCategory, retentionPeriod: created.retentionPeriod, state: created.state },
  });
  return created;
}

export async function retireRetentionRule(transaction: AuthorizedTenantTransaction, retentionRuleId: string) {
  requirePermission(transaction.membership.role, permissions.privacyManage);
  const [candidate] = await transaction.db.select().from(retentionRules).where(and(
    eq(retentionRules.id, retentionRuleId), eq(retentionRules.organizationId, transaction.context.organizationId),
  )).limit(1);
  if (!candidate) throw new Error("Retention rule was not found in the authorized organization");
  if (candidate.state !== "ACTIVE") throw new Error(`Only an ACTIVE retention rule can be retired; current state is ${candidate.state}`);
  const [retired] = await transaction.db.update(retentionRules).set({ state: "ARCHIVED", updatedAt: new Date() })
    .where(eq(retentionRules.id, candidate.id)).returning();
  if (!retired) throw new Error("Retention rule retirement did not return a row");
  await recordDomainChange(transaction, {
    eventType: "privacy.retention_rule.retired", aggregateType: "retention_rule", aggregateId: retired.id,
    action: "privacy.retention_rule.retire", entityType: "retention_rule",
    oldValues: { state: candidate.state }, newValues: { state: retired.state },
    payload: { retentionRuleId: retired.id, processingActivityId: retired.processingActivityId, state: retired.state },
  });
  return retired;
}

export async function registerPrivacyNotice(transaction: AuthorizedTenantTransaction, input: {
  noticeKey: string;
  title: string;
  contentHash: string;
  storageReference: string;
  effectiveAt?: string;
}) {
  requirePermission(transaction.membership.role, permissions.privacyManage);
  const noticeKey = text(input.noticeKey, "noticeKey", 200);
  const [versionRow] = await transaction.db.select({ nextVersion: sql<number>`coalesce(max(${privacyNotices.version}), 0) + 1` })
    .from(privacyNotices).where(and(eq(privacyNotices.organizationId, transaction.context.organizationId), eq(privacyNotices.noticeKey, noticeKey)));
  const effectiveAt = input.effectiveAt?.trim() ? timestamp(input.effectiveAt, "effectiveAt") : undefined;
  const [created] = await transaction.db.insert(privacyNotices).values({
    organizationId: transaction.context.organizationId,
    noticeKey,
    version: Number(versionRow?.nextVersion ?? 1),
    title: text(input.title, "title", 500),
    contentHash: hash(input.contentHash, "contentHash"),
    storageReference: text(input.storageReference, "storageReference", 2_000),
    ...(effectiveAt ? { effectiveAt } : {}),
    createdBy: transaction.principal.userId,
  }).returning();
  if (!created) throw new Error("Privacy notice insert did not return a row");
  await recordDomainChange(transaction, {
    eventType: "privacy.notice.registered", aggregateType: "privacy_notice", aggregateId: created.id,
    action: "privacy.notice.register", entityType: "privacy_notice",
    payload: { noticeId: created.id, noticeKey: created.noticeKey, version: created.version },
    newValues: { title: created.title, contentHash: created.contentHash, storageReference: created.storageReference },
  });
  return created;
}

export async function approvePrivacyNotice(transaction: AuthorizedTenantTransaction, noticeId: string) {
  requirePermission(transaction.membership.role, permissions.privacyApprove);
  const [candidate] = await transaction.db.select().from(privacyNotices).where(and(
    eq(privacyNotices.id, noticeId), eq(privacyNotices.organizationId, transaction.context.organizationId),
  )).limit(1);
  if (!candidate) throw new Error("Privacy notice was not found in the authorized organization");
  if (candidate.createdBy === transaction.principal.userId) throw new Error("Privacy notice creator cannot approve the same notice");
  const [approved] = await transaction.db.update(privacyNotices).set({ approvedBy: transaction.principal.userId, approvedAt: new Date() })
    .where(eq(privacyNotices.id, candidate.id)).returning();
  if (!approved) throw new Error("Privacy notice approval did not return a row");
  await recordDomainChange(transaction, {
    eventType: "privacy.notice.approved", aggregateType: "privacy_notice", aggregateId: approved.id,
    action: "privacy.notice.approve", entityType: "privacy_notice", oldValues: { approvedBy: candidate.approvedBy },
    newValues: { approvedBy: approved.approvedBy, approvedAt: approved.approvedAt }, payload: { noticeId: approved.id },
  });
  return approved;
}

export async function retirePrivacyNotice(transaction: AuthorizedTenantTransaction, noticeId: string) {
  requirePermission(transaction.membership.role, permissions.privacyManage);
  const [candidate] = await transaction.db.select().from(privacyNotices).where(and(
    eq(privacyNotices.id, noticeId), eq(privacyNotices.organizationId, transaction.context.organizationId),
  )).limit(1);
  if (!candidate) throw new Error("Privacy notice was not found in the authorized organization");
  if (!candidate.approvedAt) throw new Error("Only an approved privacy notice can be retired");
  if (candidate.retiredAt) return candidate;
  const [retired] = await transaction.db.update(privacyNotices).set({ retiredAt: new Date() })
    .where(eq(privacyNotices.id, candidate.id)).returning();
  if (!retired) throw new Error("Privacy notice retirement did not return a row");
  await recordDomainChange(transaction, {
    eventType: "privacy.notice.retired", aggregateType: "privacy_notice", aggregateId: retired.id,
    action: "privacy.notice.retire", entityType: "privacy_notice",
    oldValues: { retiredAt: candidate.retiredAt },
    newValues: { retiredAt: retired.retiredAt },
    payload: { noticeId: retired.id, noticeKey: retired.noticeKey, version: retired.version },
  });
  return retired;
}

export async function recordConsent(transaction: AuthorizedTenantTransaction, input: {
  subjectReferenceHash: string;
  purpose: string;
  capturedAt: string;
  processingActivityId?: string;
  noticeId?: string;
  provenance?: Record<string, unknown>;
}) {
  requirePermission(transaction.membership.role, permissions.privacyManage);
  if (input.processingActivityId) await requireActivity(transaction, input.processingActivityId);
  if (input.noticeId) {
    const [notice] = await transaction.db.select({ id: privacyNotices.id, approvedAt: privacyNotices.approvedAt, retiredAt: privacyNotices.retiredAt }).from(privacyNotices).where(and(
      eq(privacyNotices.id, input.noticeId), eq(privacyNotices.organizationId, transaction.context.organizationId),
    )).limit(1);
    if (!notice) throw new Error("Privacy notice was not found in the authorized organization");
    if (!notice.approvedAt) throw new Error("Consent must reference an approved privacy notice");
    if (notice.retiredAt) throw new Error("Consent cannot reference a retired privacy notice");
  }
  const [created] = await transaction.db.insert(consentRecords).values({
    organizationId: transaction.context.organizationId,
    subjectReferenceHash: hash(input.subjectReferenceHash, "subjectReferenceHash"),
    purpose: text(input.purpose, "purpose", 1_000),
    status: "GIVEN",
    capturedAt: timestamp(input.capturedAt, "capturedAt"),
    ...(input.processingActivityId ? { processingActivityId: input.processingActivityId } : {}),
    ...(input.noticeId ? { noticeId: input.noticeId } : {}),
    ...(input.provenance ? { provenance: input.provenance } : {}),
  }).returning();
  if (!created) throw new Error("Consent record insert did not return a row");
  await recordDomainChange(transaction, {
    eventType: "privacy.consent.recorded", aggregateType: "consent", aggregateId: created.id,
    action: "privacy.consent.record", entityType: "consent_record",
    payload: { consentId: created.id, status: created.status }, metadata: { subjectIdentifierStoredAsHash: true },
  });
  return created;
}

export async function withdrawConsent(transaction: AuthorizedTenantTransaction, consentId: string) {
  requirePermission(transaction.membership.role, permissions.privacyManage);
  const [candidate] = await transaction.db.select().from(consentRecords).where(and(
    eq(consentRecords.id, consentId), eq(consentRecords.organizationId, transaction.context.organizationId),
  )).limit(1);
  if (!candidate) throw new Error("Consent record was not found in the authorized organization");
  if (candidate.status !== "GIVEN") throw new Error(`Consent cannot be withdrawn from ${candidate.status}`);
  const [withdrawn] = await transaction.db.update(consentRecords).set({ status: "WITHDRAWN", withdrawnAt: new Date() })
    .where(eq(consentRecords.id, candidate.id)).returning();
  if (!withdrawn) throw new Error("Consent withdrawal did not return a row");
  await recordDomainChange(transaction, {
    eventType: "privacy.consent.withdrawn", aggregateType: "consent", aggregateId: withdrawn.id,
    action: "privacy.consent.withdraw", entityType: "consent_record", oldValues: { status: candidate.status },
    newValues: { status: withdrawn.status, withdrawnAt: withdrawn.withdrawnAt }, payload: { consentId: withdrawn.id },
  });
  return withdrawn;
}
