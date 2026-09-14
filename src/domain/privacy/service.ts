import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

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

import {
  validateBreach,
  validateDpia,
  validateDsr,
  validateProcessingActivity,
  validateProcessor,
  validateTransfer,
  type CreateDpiaInput,
  type CreateDsrInput,
  type CreateProcessingActivityInput,
  type CreateTransferInput,
  type RecordBreachInput,
  type RegisterProcessorInput,
} from "./validation";

export async function listProcessingActivities(transaction: AuthorizedTenantTransaction) {
  requirePermission(transaction.membership.role, permissions.privacyRead);
  return transaction.db
    .select()
    .from(processingActivities)
    .where(eq(processingActivities.organizationId, transaction.context.organizationId))
    .orderBy(processingActivities.name);
}

export async function createProcessingActivity(
  transaction: AuthorizedTenantTransaction,
  input: CreateProcessingActivityInput,
) {
  requirePermission(transaction.membership.role, permissions.privacyManage);
  const validated = validateProcessingActivity(input);

  const [created] = await transaction.db
    .insert(processingActivities)
    .values({
      organizationId: transaction.context.organizationId,
      clientId: validated.clientId,
      name: validated.name,
      purpose: validated.purpose,
      controllerProcessorRole: validated.controllerProcessorRole,
      dataSubjectCategories: validated.dataSubjectCategories,
      personalDataCategories: validated.personalDataCategories,
      specialCategoryData: validated.specialCategoryData,
      lawfulBasis: validated.lawfulBasis,
      recipients: validated.recipients,
      retentionSummary: validated.retentionSummary,
      securityMeasuresSummary: validated.securityMeasuresSummary,
      ownerUserId: validated.ownerUserId,
      createdBy: transaction.principal.userId,
    })
    .returning();

  if (!created) throw new Error("Processing activity insert did not return a row");

  await recordDomainChange(transaction, {
    eventType: "privacy.processing_activity.created",
    aggregateType: "processing_activity",
    aggregateId: created.id,
    action: "privacy.processing_activity.create",
    entityType: "processing_activity",
    payload: { processingActivityId: created.id, state: created.state },
    newValues: { id: created.id, name: created.name, state: created.state },
  });
  return created;
}

export async function createDpiaAssessment(
  transaction: AuthorizedTenantTransaction,
  input: CreateDpiaInput,
) {
  requirePermission(transaction.membership.role, permissions.privacyManage);
  const validated = validateDpia(input);

  const [activity] = await transaction.db
    .select({ id: processingActivities.id })
    .from(processingActivities)
    .where(and(
      eq(processingActivities.id, validated.processingActivityId),
      eq(processingActivities.organizationId, transaction.context.organizationId),
    ))
    .limit(1);
  if (!activity) throw new Error("Processing activity was not found in the authorized organization");

  const [versionRow] = await transaction.db
    .select({ nextVersion: sql<number>`coalesce(max(${dpiaAssessments.version}), 0) + 1` })
    .from(dpiaAssessments)
    .where(eq(dpiaAssessments.processingActivityId, validated.processingActivityId));

  const [created] = await transaction.db
    .insert(dpiaAssessments)
    .values({
      organizationId: transaction.context.organizationId,
      processingActivityId: validated.processingActivityId,
      version: Number(versionRow?.nextVersion ?? 1),
      screeningRationale: validated.screeningRationale,
      decision: validated.decision,
      riskSummary: validated.riskSummary,
      mitigationSummary: validated.mitigationSummary,
      residualRisk: validated.residualRisk,
      createdBy: transaction.principal.userId,
    })
    .returning();
  if (!created) throw new Error("DPIA insert did not return a row");

  await recordDomainChange(transaction, {
    eventType: "privacy.dpia.created",
    aggregateType: "dpia",
    aggregateId: created.id,
    action: "privacy.dpia.create",
    entityType: "dpia",
    payload: { dpiaId: created.id, processingActivityId: created.processingActivityId, version: created.version, decision: created.decision },
  });
  return created;
}

export async function approveDpiaAssessment(
  transaction: AuthorizedTenantTransaction,
  dpiaId: string,
) {
  requirePermission(transaction.membership.role, permissions.privacyApprove);

  const [candidate] = await transaction.db
    .select()
    .from(dpiaAssessments)
    .where(and(
      eq(dpiaAssessments.id, dpiaId),
      eq(dpiaAssessments.organizationId, transaction.context.organizationId),
    ))
    .limit(1);
  if (!candidate) throw new Error("DPIA was not found in the authorized organization");
  if (candidate.createdBy === transaction.principal.userId) {
    throw new Error("DPIA creator cannot approve the same DPIA");
  }
  if (candidate.decision === "APPROVED") return candidate;
  if (candidate.decision === "NOT_REQUIRED") throw new Error("A NOT_REQUIRED DPIA screening cannot be approved as a DPIA");

  const [approved] = await transaction.db
    .update(dpiaAssessments)
    .set({
      decision: "APPROVED",
      approvedBy: transaction.principal.userId,
      approvedAt: new Date(),
    })
    .where(eq(dpiaAssessments.id, candidate.id))
    .returning();
  if (!approved) throw new Error("DPIA approval did not return a row");

  await recordDomainChange(transaction, {
    eventType: "privacy.dpia.approved",
    aggregateType: "dpia",
    aggregateId: approved.id,
    action: "privacy.dpia.approve",
    entityType: "dpia",
    payload: { dpiaId: approved.id, processingActivityId: approved.processingActivityId },
    oldValues: { decision: candidate.decision },
    newValues: { decision: approved.decision, approvedBy: approved.approvedBy },
  });
  return approved;
}

export async function registerProcessor(
  transaction: AuthorizedTenantTransaction,
  input: RegisterProcessorInput,
) {
  requirePermission(transaction.membership.role, permissions.privacyManage);
  const validated = validateProcessor(input);

  const [created] = await transaction.db
    .insert(processors)
    .values({
      organizationId: transaction.context.organizationId,
      name: validated.name,
      serviceDescription: validated.serviceDescription,
      country: validated.country,
      contractReference: validated.contractReference,
      dpaReference: validated.dpaReference,
      securityReviewStatus: validated.securityReviewStatus,
      ownerUserId: validated.ownerUserId,
      createdBy: transaction.principal.userId,
    })
    .returning();
  if (!created) throw new Error("Processor insert did not return a row");

  await recordDomainChange(transaction, {
    eventType: "privacy.processor.registered",
    aggregateType: "processor",
    aggregateId: created.id,
    action: "privacy.processor.create",
    entityType: "processor",
    payload: { processorId: created.id, status: created.status },
  });
  return created;
}

export async function createInternationalTransfer(
  transaction: AuthorizedTenantTransaction,
  input: CreateTransferInput,
) {
  requirePermission(transaction.membership.role, permissions.privacyManage);
  const validated = validateTransfer(input);

  const [activity] = await transaction.db
    .select({ id: processingActivities.id })
    .from(processingActivities)
    .where(and(
      eq(processingActivities.id, validated.processingActivityId),
      eq(processingActivities.organizationId, transaction.context.organizationId),
    ))
    .limit(1);
  if (!activity) throw new Error("Processing activity was not found in the authorized organization");

  if (validated.processorId) {
    const [processor] = await transaction.db
      .select({ id: processors.id })
      .from(processors)
      .where(and(
        eq(processors.id, validated.processorId),
        eq(processors.organizationId, transaction.context.organizationId),
      ))
      .limit(1);
    if (!processor) throw new Error("Processor was not found in the authorized organization");
  }

  const [created] = await transaction.db
    .insert(internationalTransfers)
    .values({
      organizationId: transaction.context.organizationId,
      processingActivityId: validated.processingActivityId,
      processorId: validated.processorId,
      destinationCountry: validated.destinationCountry,
      mechanism: validated.mechanism,
      mechanismReference: validated.mechanismReference,
      transferRiskAssessmentReference: validated.transferRiskAssessmentReference,
      supplementaryMeasures: validated.supplementaryMeasures,
      createdBy: transaction.principal.userId,
    })
    .returning();
  if (!created) throw new Error("Transfer insert did not return a row");

  await recordDomainChange(transaction, {
    eventType: "privacy.transfer.created",
    aggregateType: "international_transfer",
    aggregateId: created.id,
    action: "privacy.transfer.create",
    entityType: "international_transfer",
    payload: { transferId: created.id, mechanism: created.mechanism, destinationCountry: created.destinationCountry },
  });
  return created;
}

export async function createDataSubjectRequest(
  transaction: AuthorizedTenantTransaction,
  input: CreateDsrInput,
) {
  requirePermission(transaction.membership.role, permissions.privacyDsrManage);
  const validated = validateDsr(input);

  const [created] = await transaction.db
    .insert(dataSubjectRequests)
    .values({
      organizationId: transaction.context.organizationId,
      requestType: validated.requestType,
      subjectReferenceHash: validated.subjectReferenceHash,
      receivedAt: validated.receivedAt,
      dueAt: validated.dueAt,
      assignedTo: validated.assignedTo,
      createdBy: transaction.principal.userId,
    })
    .returning();
  if (!created) throw new Error("DSR insert did not return a row");

  await recordDomainChange(transaction, {
    eventType: "privacy.dsr.received",
    aggregateType: "data_subject_request",
    aggregateId: created.id,
    action: "privacy.dsr.create",
    entityType: "data_subject_request",
    payload: { dsrId: created.id, requestType: created.requestType, status: created.status },
    metadata: { subjectIdentifierStoredAsHash: true },
  });
  return created;
}

export async function recordPrivacyBreach(
  transaction: AuthorizedTenantTransaction,
  input: RecordBreachInput,
) {
  requirePermission(transaction.membership.role, permissions.privacyBreachManage);
  const validated = validateBreach(input);

  const [created] = await transaction.db
    .insert(privacyBreaches)
    .values({
      organizationId: transaction.context.organizationId,
      title: validated.title,
      detectedAt: validated.detectedAt,
      occurredAt: validated.occurredAt,
      description: validated.description,
      dataCategories: validated.dataCategories,
      affectedSubjectsEstimate: validated.affectedSubjectsEstimate,
      severity: validated.severity,
      notificationRequired: validated.notificationRequired,
      notificationRationale: validated.notificationRationale,
      ownerUserId: validated.ownerUserId,
      createdBy: transaction.principal.userId,
    })
    .returning();
  if (!created) throw new Error("Privacy breach insert did not return a row");

  await recordDomainChange(transaction, {
    eventType: "privacy.breach.detected",
    aggregateType: "privacy_breach",
    aggregateId: created.id,
    action: "privacy.breach.create",
    entityType: "privacy_breach",
    payload: { breachId: created.id, status: created.status, notificationRequired: created.notificationRequired },
  });
  return created;
}

export async function latestDpiaForActivity(
  transaction: AuthorizedTenantTransaction,
  processingActivityId: string,
) {
  requirePermission(transaction.membership.role, permissions.privacyRead);
  const [latest] = await transaction.db
    .select()
    .from(dpiaAssessments)
    .where(and(
      eq(dpiaAssessments.processingActivityId, processingActivityId),
      eq(dpiaAssessments.organizationId, transaction.context.organizationId),
    ))
    .orderBy(desc(dpiaAssessments.version))
    .limit(1);
  return latest ?? null;
}
