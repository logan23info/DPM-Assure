import "server-only";

import { and, eq } from "drizzle-orm";

import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions, requirePermission } from "@/auth/rbac";
import {
  dataSubjectRequests,
  dpiaAssessments,
  internationalTransfers,
  privacyBreaches,
  processingActivities,
  processors,
} from "@/db/privacy-schema";
import { recordDomainChange } from "@/domain/record-event";

async function requireTenantRecord<T extends { id: string }>(
  rows: readonly T[],
  label: string,
): Promise<T> {
  const row = rows[0];
  if (!row) throw new Error(`${label} was not found in the authorized organization`);
  return row;
}

export async function activateProcessingActivity(
  transaction: AuthorizedTenantTransaction,
  activityId: string,
  nextReviewAt?: Date,
) {
  requirePermission(transaction.membership.role, permissions.privacyApprove);
  const candidate = await requireTenantRecord(
    await transaction.db.select().from(processingActivities).where(and(
      eq(processingActivities.id, activityId),
      eq(processingActivities.organizationId, transaction.context.organizationId),
    )).limit(1),
    "Processing activity",
  );
  const now = new Date();
  const [updated] = await transaction.db.update(processingActivities).set({
    state: "ACTIVE",
    reviewedBy: transaction.principal.userId,
    reviewedAt: now,
    nextReviewAt: nextReviewAt ?? null,
  }).where(eq(processingActivities.id, candidate.id)).returning();
  if (!updated) throw new Error("Processing activity activation did not return a row");
  await recordDomainChange(transaction, {
    eventType: "privacy.processing_activity.activated",
    aggregateType: "processing_activity",
    aggregateId: updated.id,
    action: "privacy.processing_activity.activate",
    entityType: "processing_activity",
    oldValues: { state: candidate.state },
    newValues: { state: updated.state, reviewedBy: updated.reviewedBy, nextReviewAt: updated.nextReviewAt },
    payload: { processingActivityId: updated.id, state: updated.state },
  });
  return updated;
}

export async function startDpiaAssessment(
  transaction: AuthorizedTenantTransaction,
  dpiaId: string,
) {
  requirePermission(transaction.membership.role, permissions.privacyManage);
  const candidate = await requireTenantRecord(
    await transaction.db.select().from(dpiaAssessments).where(and(
      eq(dpiaAssessments.id, dpiaId),
      eq(dpiaAssessments.organizationId, transaction.context.organizationId),
    )).limit(1),
    "DPIA",
  );
  if (candidate.decision !== "REQUIRED" && candidate.decision !== "REJECTED") {
    throw new Error(`DPIA cannot enter IN_PROGRESS from ${candidate.decision}`);
  }
  const [updated] = await transaction.db.update(dpiaAssessments).set({ decision: "IN_PROGRESS" })
    .where(eq(dpiaAssessments.id, candidate.id)).returning();
  if (!updated) throw new Error("DPIA transition did not return a row");
  await recordDomainChange(transaction, {
    eventType: "privacy.dpia.started",
    aggregateType: "dpia",
    aggregateId: updated.id,
    action: "privacy.dpia.start",
    entityType: "dpia",
    oldValues: { decision: candidate.decision },
    newValues: { decision: updated.decision },
    payload: { dpiaId: updated.id, decision: updated.decision },
  });
  return updated;
}

export async function approveInProgressDpia(
  transaction: AuthorizedTenantTransaction,
  dpiaId: string,
) {
  requirePermission(transaction.membership.role, permissions.privacyApprove);
  const candidate = await requireTenantRecord(
    await transaction.db.select().from(dpiaAssessments).where(and(
      eq(dpiaAssessments.id, dpiaId),
      eq(dpiaAssessments.organizationId, transaction.context.organizationId),
    )).limit(1),
    "DPIA",
  );
  if (candidate.decision !== "IN_PROGRESS") throw new Error("Only an IN_PROGRESS DPIA can be approved");
  if (candidate.createdBy === transaction.principal.userId) throw new Error("DPIA creator cannot approve the same DPIA");
  const [updated] = await transaction.db.update(dpiaAssessments).set({
    decision: "APPROVED",
    approvedBy: transaction.principal.userId,
    approvedAt: new Date(),
  }).where(eq(dpiaAssessments.id, candidate.id)).returning();
  if (!updated) throw new Error("DPIA approval did not return a row");
  await recordDomainChange(transaction, {
    eventType: "privacy.dpia.approved",
    aggregateType: "dpia",
    aggregateId: updated.id,
    action: "privacy.dpia.approve",
    entityType: "dpia",
    oldValues: { decision: candidate.decision },
    newValues: { decision: updated.decision, approvedBy: updated.approvedBy },
    payload: { dpiaId: updated.id, decision: updated.decision },
  });
  return updated;
}

export async function activateProcessor(
  transaction: AuthorizedTenantTransaction,
  processorId: string,
  nextReviewAt?: Date,
) {
  requirePermission(transaction.membership.role, permissions.privacyApprove);
  const candidate = await requireTenantRecord(
    await transaction.db.select().from(processors).where(and(
      eq(processors.id, processorId),
      eq(processors.organizationId, transaction.context.organizationId),
    )).limit(1),
    "Processor",
  );
  const now = new Date();
  const [updated] = await transaction.db.update(processors).set({
    status: "ACTIVE",
    dueDiligenceCompletedAt: now,
    approvedBy: transaction.principal.userId,
    approvedAt: now,
    nextReviewAt: nextReviewAt ?? null,
  }).where(eq(processors.id, candidate.id)).returning();
  if (!updated) throw new Error("Processor activation did not return a row");
  await recordDomainChange(transaction, {
    eventType: "privacy.processor.activated",
    aggregateType: "processor",
    aggregateId: updated.id,
    action: "privacy.processor.activate",
    entityType: "processor",
    oldValues: { status: candidate.status },
    newValues: { status: updated.status, approvedBy: updated.approvedBy, nextReviewAt: updated.nextReviewAt },
    payload: { processorId: updated.id, status: updated.status },
  });
  return updated;
}

export async function updateProcessorDueDiligence(
  transaction: AuthorizedTenantTransaction,
  processorId: string,
  input: {
    serviceDescription: string;
    country?: string;
    contractReference: string;
    dpaReference: string;
    securityReviewStatus: string;
  },
) {
  requirePermission(transaction.membership.role, permissions.privacyManage);
  const candidate = await requireTenantRecord(
    await transaction.db.select().from(processors).where(and(
      eq(processors.id, processorId),
      eq(processors.organizationId, transaction.context.organizationId),
    )).limit(1),
    "Processor",
  );
  if (candidate.status === "ACTIVE") {
    throw new Error("An active processor cannot be edited; suspend it before changing due-diligence details");
  }
  const [updated] = await transaction.db.update(processors).set({
    serviceDescription: input.serviceDescription.trim(),
    country: input.country?.trim() || null,
    contractReference: input.contractReference.trim(),
    dpaReference: input.dpaReference.trim(),
    securityReviewStatus: input.securityReviewStatus.trim(),
    updatedAt: new Date(),
  }).where(eq(processors.id, candidate.id)).returning();
  if (!updated) throw new Error("Processor due-diligence update did not return a row");
  await recordDomainChange(transaction, {
    eventType: "privacy.processor.updated",
    aggregateType: "processor",
    aggregateId: updated.id,
    action: "privacy.processor.update",
    entityType: "processor",
    oldValues: {
      serviceDescription: candidate.serviceDescription,
      country: candidate.country,
      contractReference: candidate.contractReference,
      dpaReference: candidate.dpaReference,
      securityReviewStatus: candidate.securityReviewStatus,
    },
    newValues: {
      serviceDescription: updated.serviceDescription,
      country: updated.country,
      contractReference: updated.contractReference,
      dpaReference: updated.dpaReference,
      securityReviewStatus: updated.securityReviewStatus,
    },
    payload: { processorId: updated.id, status: updated.status },
  });
  return updated;
}

export async function submitTransferForReview(
  transaction: AuthorizedTenantTransaction,
  transferId: string,
) {
  requirePermission(transaction.membership.role, permissions.privacyManage);
  const candidate = await requireTenantRecord(
    await transaction.db.select().from(internationalTransfers).where(and(
      eq(internationalTransfers.id, transferId),
      eq(internationalTransfers.organizationId, transaction.context.organizationId),
    )).limit(1),
    "International transfer",
  );
  const [updated] = await transaction.db.update(internationalTransfers).set({ state: "UNDER_REVIEW" })
    .where(eq(internationalTransfers.id, candidate.id)).returning();
  if (!updated) throw new Error("Transfer review transition did not return a row");
  await recordDomainChange(transaction, {
    eventType: "privacy.transfer.review_requested",
    aggregateType: "international_transfer",
    aggregateId: updated.id,
    action: "privacy.transfer.review_request",
    entityType: "international_transfer",
    oldValues: { state: candidate.state },
    newValues: { state: updated.state },
    payload: { transferId: updated.id, state: updated.state },
  });
  return updated;
}

export async function approveTransfer(
  transaction: AuthorizedTenantTransaction,
  transferId: string,
  nextReviewAt?: Date,
) {
  requirePermission(transaction.membership.role, permissions.privacyApprove);
  const candidate = await requireTenantRecord(
    await transaction.db.select().from(internationalTransfers).where(and(
      eq(internationalTransfers.id, transferId),
      eq(internationalTransfers.organizationId, transaction.context.organizationId),
    )).limit(1),
    "International transfer",
  );
  if (candidate.state !== "UNDER_REVIEW") throw new Error("Only an UNDER_REVIEW transfer can be activated");
  if (candidate.createdBy === transaction.principal.userId) throw new Error("Transfer creator cannot approve activation");
  const [updated] = await transaction.db.update(internationalTransfers).set({
    state: "ACTIVE",
    approvedBy: transaction.principal.userId,
    approvedAt: new Date(),
    nextReviewAt: nextReviewAt ?? null,
  }).where(eq(internationalTransfers.id, candidate.id)).returning();
  if (!updated) throw new Error("Transfer approval did not return a row");
  await recordDomainChange(transaction, {
    eventType: "privacy.transfer.activated",
    aggregateType: "international_transfer",
    aggregateId: updated.id,
    action: "privacy.transfer.approve",
    entityType: "international_transfer",
    oldValues: { state: candidate.state },
    newValues: { state: updated.state, approvedBy: updated.approvedBy, nextReviewAt: updated.nextReviewAt },
    payload: { transferId: updated.id, state: updated.state },
  });
  return updated;
}

export async function transitionDsr(
  transaction: AuthorizedTenantTransaction,
  dsrId: string,
  update: {
    status: "IDENTITY_VERIFICATION" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "REJECTED" | "CANCELLED";
    identityVerifiedAt?: Date;
    outcome?: string;
  },
) {
  requirePermission(transaction.membership.role, permissions.privacyDsrManage);
  const candidate = await requireTenantRecord(
    await transaction.db.select().from(dataSubjectRequests).where(and(
      eq(dataSubjectRequests.id, dsrId),
      eq(dataSubjectRequests.organizationId, transaction.context.organizationId),
    )).limit(1),
    "Data subject request",
  );
  const [updated] = await transaction.db.update(dataSubjectRequests).set({
    status: update.status,
    identityVerifiedAt: update.identityVerifiedAt ?? candidate.identityVerifiedAt,
    outcome: update.outcome ?? candidate.outcome,
    closedAt: update.status === "COMPLETED" ? new Date() : candidate.closedAt,
  }).where(eq(dataSubjectRequests.id, candidate.id)).returning();
  if (!updated) throw new Error("DSR transition did not return a row");
  await recordDomainChange(transaction, {
    eventType: `privacy.dsr.${updated.status.toLowerCase()}`,
    aggregateType: "data_subject_request",
    aggregateId: updated.id,
    action: "privacy.dsr.transition",
    entityType: "data_subject_request",
    oldValues: { status: candidate.status },
    newValues: { status: updated.status, closedAt: updated.closedAt },
    payload: { dsrId: updated.id, status: updated.status },
  });
  return updated;
}

export async function transitionPrivacyBreach(
  transaction: AuthorizedTenantTransaction,
  breachId: string,
  update: {
    status: "TRIAGE" | "INVESTIGATING" | "CONTAINED" | "NOTIFICATION_ASSESSMENT" | "NOTIFIED" | "CLOSED";
    containmentSummary?: string;
    notificationRequired?: boolean;
    notificationRationale?: string;
    authorityNotifiedAt?: Date;
    subjectsNotifiedAt?: Date;
  },
) {
  requirePermission(transaction.membership.role, permissions.privacyBreachManage);
  const candidate = await requireTenantRecord(
    await transaction.db.select().from(privacyBreaches).where(and(
      eq(privacyBreaches.id, breachId),
      eq(privacyBreaches.organizationId, transaction.context.organizationId),
    )).limit(1),
    "Privacy breach",
  );
  const [updated] = await transaction.db.update(privacyBreaches).set({
    status: update.status,
    containmentSummary: update.containmentSummary ?? candidate.containmentSummary,
    notificationRequired: update.notificationRequired ?? candidate.notificationRequired,
    notificationRationale: update.notificationRationale ?? candidate.notificationRationale,
    authorityNotifiedAt: update.authorityNotifiedAt ?? candidate.authorityNotifiedAt,
    subjectsNotifiedAt: update.subjectsNotifiedAt ?? candidate.subjectsNotifiedAt,
  }).where(eq(privacyBreaches.id, candidate.id)).returning();
  if (!updated) throw new Error("Breach transition did not return a row");
  await recordDomainChange(transaction, {
    eventType: `privacy.breach.${updated.status.toLowerCase()}`,
    aggregateType: "privacy_breach",
    aggregateId: updated.id,
    action: "privacy.breach.transition",
    entityType: "privacy_breach",
    oldValues: { status: candidate.status },
    newValues: { status: updated.status, notificationRequired: updated.notificationRequired },
    payload: { breachId: updated.id, status: updated.status, notificationRequired: updated.notificationRequired },
  });
  return updated;
}
