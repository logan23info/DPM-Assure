import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import {
  AuthenticationRequiredError,
  requireAuthenticatedPrincipal,
  type SessionResolver,
} from "@/auth/session";
import { AuthorizationDeniedError, permissions } from "@/auth/rbac";
import { clients, engagements } from "@/db/schema";
import { privacyAssuranceCandidates } from "@/db/privacy-assurance-schema";
import { privacyAlerts } from "@/db/privacy-alert-schema";
import {
  dataSubjectRequests,
  dpiaAssessments,
  internationalTransfers,
  privacyBreaches,
  privacyNotices,
  processingActivities,
  processors,
  retentionRules,
  consentRecords,
} from "@/db/privacy-schema";
import {
  createDataSubjectRequest,
  createDpiaAssessment,
  createInternationalTransfer,
  createProcessingActivity,
  recordPrivacyBreach,
  registerProcessor,
} from "@/domain/privacy/service";
import {
  activateProcessingActivity,
  activateProcessor,
  approveInProgressDpia,
  approveTransfer,
  closeProcessingActivity,
  closeTransfer,
  suspendProcessor,
  startDpiaAssessment,
  submitTransferForReview,
  transitionDsr,
  transitionPrivacyBreach,
  updateProcessorDueDiligence,
} from "@/domain/privacy/workflow-service";
import {
  acceptPrivacyAssuranceCandidate,
  proposePrivacyAssuranceCandidate,
  rejectPrivacyAssuranceCandidate,
} from "@/domain/privacy/assurance-integration-service";
import type { ProposePrivacyAssuranceCandidateInput } from "@/domain/privacy/assurance-integration-validation";
import {
  approvePrivacyNotice,
  createRetentionRule,
  recordConsent,
  registerPrivacyNotice,
  withdrawConsent,
} from "@/domain/privacy/operational-service";
import {
  acknowledgePrivacyAlert,
  refreshPrivacyAlerts,
  resolvePrivacyAlert,
} from "@/domain/privacy/alerts-service";
import type {
  CreateDpiaInput,
  CreateDsrInput,
  CreateProcessingActivityInput,
  CreateTransferInput,
  RecordBreachInput,
  RegisterProcessorInput,
} from "@/domain/privacy/validation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) => Response.json(body, { status });

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function optionalText(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function requiredText(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== "string") throw new Error(`${key} is required`);
  return value;
}

function optionalDate(body: Record<string, unknown>, key: string) {
  const value = optionalText(body, key);
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${key} must be a valid date-time`);
  return parsed;
}

function errorResponse(error: unknown) {
  if (error instanceof AuthenticationRequiredError) return json({ error: "AUTHENTICATION_REQUIRED" }, 401);
  if (error instanceof AuthorizationDeniedError) return json({ error: "AUTHORIZATION_DENIED" }, 403);
  return json({ error: "INVALID_REQUEST", message: error instanceof Error ? error.message : "Request failed" }, 400);
}

async function requirePrivacyRecordInOrganization(
  transaction: Parameters<typeof proposePrivacyAssuranceCandidate>[0],
  type: ProposePrivacyAssuranceCandidateInput["privacyRecordType"],
  recordId: string,
) {
  const organizationId = transaction.context.organizationId;
  let records: { id: string }[];
  switch (type) {
    case "PROCESSING_ACTIVITY": records = await transaction.db.select({ id: processingActivities.id }).from(processingActivities).where(and(eq(processingActivities.id, recordId), eq(processingActivities.organizationId, organizationId))).limit(1); break;
    case "DPIA": records = await transaction.db.select({ id: dpiaAssessments.id }).from(dpiaAssessments).where(and(eq(dpiaAssessments.id, recordId), eq(dpiaAssessments.organizationId, organizationId))).limit(1); break;
    case "PROCESSOR": records = await transaction.db.select({ id: processors.id }).from(processors).where(and(eq(processors.id, recordId), eq(processors.organizationId, organizationId))).limit(1); break;
    case "TRANSFER": records = await transaction.db.select({ id: internationalTransfers.id }).from(internationalTransfers).where(and(eq(internationalTransfers.id, recordId), eq(internationalTransfers.organizationId, organizationId))).limit(1); break;
    case "RETENTION_RULE": records = await transaction.db.select({ id: retentionRules.id }).from(retentionRules).where(and(eq(retentionRules.id, recordId), eq(retentionRules.organizationId, organizationId))).limit(1); break;
    case "NOTICE": records = await transaction.db.select({ id: privacyNotices.id }).from(privacyNotices).where(and(eq(privacyNotices.id, recordId), eq(privacyNotices.organizationId, organizationId))).limit(1); break;
    case "CONSENT": records = await transaction.db.select({ id: consentRecords.id }).from(consentRecords).where(and(eq(consentRecords.id, recordId), eq(consentRecords.organizationId, organizationId))).limit(1); break;
    case "DSR": records = await transaction.db.select({ id: dataSubjectRequests.id }).from(dataSubjectRequests).where(and(eq(dataSubjectRequests.id, recordId), eq(dataSubjectRequests.organizationId, organizationId))).limit(1); break;
    case "BREACH": records = await transaction.db.select({ id: privacyBreaches.id }).from(privacyBreaches).where(and(eq(privacyBreaches.id, recordId), eq(privacyBreaches.organizationId, organizationId))).limit(1); break;
    case "PRIVACY_ALERT": records = await transaction.db.select({ id: privacyAlerts.id }).from(privacyAlerts).where(and(eq(privacyAlerts.id, recordId), eq(privacyAlerts.organizationId, organizationId))).limit(1); break;
    default: throw new Error("This privacy record type cannot be linked to assurance work yet");
  }
  if (!records[0]) throw new Error("Privacy record was not found in the authorized organization");
}

export function createPrivacyOperationsApi(resolver: SessionResolver) {
  return {
    async get(organizationId: string) {
      try {
        if (!UUID.test(organizationId)) throw new Error("organizationId must be a UUID");
        const principal = await requireAuthenticatedPrincipal(resolver);
        return withAuthorizedTenantTransaction(
          { principal, organizationId, requestId: crypto.randomUUID(), permission: permissions.privacyRead },
          async (tx) => json({
            clients: await tx.db.select({ id: clients.id, name: clients.name }).from(clients)
              .where(eq(clients.organizationId, organizationId)),
            engagements: await tx.db.select({ id: engagements.id, name: engagements.name, status: engagements.status }).from(engagements)
              .where(eq(engagements.organizationId, organizationId)).orderBy(desc(engagements.createdAt)),
            assuranceCandidates: await tx.db.select().from(privacyAssuranceCandidates)
              .where(eq(privacyAssuranceCandidates.organizationId, organizationId)).orderBy(desc(privacyAssuranceCandidates.proposedAt)),
            retentionRules: await tx.db.select().from(retentionRules)
              .where(eq(retentionRules.organizationId, organizationId)).orderBy(desc(retentionRules.createdAt)),
            notices: await tx.db.select().from(privacyNotices)
              .where(eq(privacyNotices.organizationId, organizationId)).orderBy(desc(privacyNotices.createdAt)),
            consents: await tx.db.select().from(consentRecords)
              .where(eq(consentRecords.organizationId, organizationId)).orderBy(desc(consentRecords.createdAt)),
            alerts: await tx.db.select().from(privacyAlerts)
              .where(eq(privacyAlerts.organizationId, organizationId)).orderBy(privacyAlerts.dueAt),
            activities: await tx.db.select().from(processingActivities)
              .where(eq(processingActivities.organizationId, organizationId)).orderBy(desc(processingActivities.createdAt)),
            dpias: await tx.db.select().from(dpiaAssessments)
              .where(eq(dpiaAssessments.organizationId, organizationId)).orderBy(desc(dpiaAssessments.createdAt)),
            processors: await tx.db.select().from(processors)
              .where(eq(processors.organizationId, organizationId)).orderBy(desc(processors.createdAt)),
            transfers: await tx.db.select().from(internationalTransfers)
              .where(eq(internationalTransfers.organizationId, organizationId)).orderBy(desc(internationalTransfers.createdAt)),
            dsrs: await tx.db.select().from(dataSubjectRequests)
              .where(eq(dataSubjectRequests.organizationId, organizationId)).orderBy(desc(dataSubjectRequests.createdAt)),
            breaches: await tx.db.select().from(privacyBreaches)
              .where(eq(privacyBreaches.organizationId, organizationId)).orderBy(desc(privacyBreaches.createdAt)),
          }),
        );
      } catch (error) {
        return errorResponse(error);
      }
    },

    async post(organizationId: string, request: Request) {
      try {
        if (!UUID.test(organizationId)) throw new Error("organizationId must be a UUID");
        const principal = await requireAuthenticatedPrincipal(resolver);
        const body = await request.json() as Record<string, unknown>;

        return withAuthorizedTenantTransaction(
          { principal, organizationId, requestId: crypto.randomUUID(), permission: permissions.privacyRead },
          async (tx) => {
            switch (requiredText(body, "action")) {
              case "create_activity": {
                const clientId = optionalText(body, "clientId");
                const lawfulBasis = optionalText(body, "lawfulBasis");
                const retentionSummary = optionalText(body, "retentionSummary");
                const securityMeasuresSummary = optionalText(body, "securityMeasuresSummary");
                const input: CreateProcessingActivityInput = {
                  name: requiredText(body, "name"),
                  purpose: requiredText(body, "purpose"),
                  controllerProcessorRole: requiredText(body, "controllerProcessorRole") as CreateProcessingActivityInput["controllerProcessorRole"],
                  dataSubjectCategories: strings(body.dataSubjectCategories),
                  personalDataCategories: strings(body.personalDataCategories),
                  recipients: strings(body.recipients),
                  ...(clientId ? { clientId } : {}),
                  ...(lawfulBasis ? { lawfulBasis } : {}),
                  ...(retentionSummary ? { retentionSummary } : {}),
                  ...(securityMeasuresSummary ? { securityMeasuresSummary } : {}),
                };
                return json(await createProcessingActivity(tx, input), 201);
              }
              case "create_dpia": {
                const riskSummary = optionalText(body, "riskSummary");
                const mitigationSummary = optionalText(body, "mitigationSummary");
                const residualRisk = optionalText(body, "residualRisk");
                const input: CreateDpiaInput = {
                  processingActivityId: requiredText(body, "processingActivityId"),
                  screeningRationale: requiredText(body, "screeningRationale"),
                  decision: requiredText(body, "decision") as CreateDpiaInput["decision"],
                  ...(riskSummary ? { riskSummary } : {}),
                  ...(mitigationSummary ? { mitigationSummary } : {}),
                  ...(residualRisk ? { residualRisk } : {}),
                };
                return json(await createDpiaAssessment(tx, input), 201);
              }
              case "create_processor": {
                const country = optionalText(body, "country");
                const contractReference = optionalText(body, "contractReference");
                const dpaReference = optionalText(body, "dpaReference");
                const securityReviewStatus = optionalText(body, "securityReviewStatus");
                const input: RegisterProcessorInput = {
                  name: requiredText(body, "name"),
                  serviceDescription: requiredText(body, "serviceDescription"),
                  ...(country ? { country } : {}),
                  ...(contractReference ? { contractReference } : {}),
                  ...(dpaReference ? { dpaReference } : {}),
                  ...(securityReviewStatus ? { securityReviewStatus } : {}),
                };
                return json(await registerProcessor(tx, input), 201);
              }
              case "create_transfer": {
                const processorId = optionalText(body, "processorId");
                const mechanismReference = optionalText(body, "mechanismReference");
                const transferRiskAssessmentReference = optionalText(body, "transferRiskAssessmentReference");
                const supplementaryMeasures = optionalText(body, "supplementaryMeasures");
                const input: CreateTransferInput = {
                  processingActivityId: requiredText(body, "processingActivityId"),
                  destinationCountry: requiredText(body, "destinationCountry"),
                  mechanism: requiredText(body, "mechanism") as CreateTransferInput["mechanism"],
                  ...(processorId ? { processorId } : {}),
                  ...(mechanismReference ? { mechanismReference } : {}),
                  ...(transferRiskAssessmentReference ? { transferRiskAssessmentReference } : {}),
                  ...(supplementaryMeasures ? { supplementaryMeasures } : {}),
                };
                return json(await createInternationalTransfer(tx, input), 201);
              }
              case "create_dsr": {
                const dueAt = optionalText(body, "dueAt");
                const input: CreateDsrInput = {
                  requestType: requiredText(body, "requestType"),
                  subjectReferenceHash: requiredText(body, "subjectReferenceHash"),
                  receivedAt: requiredText(body, "receivedAt"),
                  ...(dueAt ? { dueAt } : {}),
                };
                return json(await createDataSubjectRequest(tx, input), 201);
              }
              case "create_breach": {
                const affectedSubjectsEstimate = body.affectedSubjectsEstimate;
                const severity = optionalText(body, "severity");
                const notificationRationale = optionalText(body, "notificationRationale");
                const notificationRequired = body.notificationRequired;
                const input: RecordBreachInput = {
                  title: requiredText(body, "title"),
                  detectedAt: requiredText(body, "detectedAt"),
                  description: requiredText(body, "description"),
                  dataCategories: strings(body.dataCategories),
                  ...(typeof affectedSubjectsEstimate === "number" ? { affectedSubjectsEstimate } : {}),
                  ...(severity ? { severity } : {}),
                  ...(typeof notificationRequired === "boolean" ? { notificationRequired } : {}),
                  ...(notificationRationale ? { notificationRationale } : {}),
                };
                return json(await recordPrivacyBreach(tx, input), 201);
              }
              case "activate_activity":
                return json(await activateProcessingActivity(tx, requiredText(body, "activityId"), optionalDate(body, "nextReviewAt")));
              case "close_activity":
                return json(await closeProcessingActivity(tx, requiredText(body, "activityId")));
              case "start_dpia":
                return json(await startDpiaAssessment(tx, requiredText(body, "dpiaId")));
              case "approve_dpia":
                return json(await approveInProgressDpia(tx, requiredText(body, "dpiaId")));
              case "activate_processor":
                return json(await activateProcessor(tx, requiredText(body, "processorId"), optionalDate(body, "nextReviewAt")));
              case "suspend_processor":
                return json(await suspendProcessor(tx, requiredText(body, "processorId")));
              case "update_processor": {
                const country = optionalText(body, "country");
                return json(await updateProcessorDueDiligence(tx, requiredText(body, "processorId"), {
                  serviceDescription: requiredText(body, "serviceDescription"),
                  contractReference: requiredText(body, "contractReference"),
                  dpaReference: requiredText(body, "dpaReference"),
                  securityReviewStatus: requiredText(body, "securityReviewStatus"),
                  ...(country ? { country } : {}),
                }));
              }
              case "submit_transfer":
                return json(await submitTransferForReview(tx, requiredText(body, "transferId")));
              case "approve_transfer":
                return json(await approveTransfer(tx, requiredText(body, "transferId"), optionalDate(body, "nextReviewAt")));
              case "close_transfer":
                return json(await closeTransfer(tx, requiredText(body, "transferId")));
              case "transition_dsr": {
                const identityVerifiedAt = optionalDate(body, "identityVerifiedAt");
                const outcome = optionalText(body, "outcome");
                return json(await transitionDsr(tx, requiredText(body, "dsrId"), {
                  status: requiredText(body, "status") as Parameters<typeof transitionDsr>[2]["status"],
                  ...(identityVerifiedAt ? { identityVerifiedAt } : {}),
                  ...(outcome ? { outcome } : {}),
                }));
              }
              case "transition_breach": {
                const notificationRequired = body.notificationRequired;
                const authorityNotifiedAt = optionalDate(body, "authorityNotifiedAt");
                const subjectsNotifiedAt = optionalDate(body, "subjectsNotifiedAt");
                const containmentSummary = optionalText(body, "containmentSummary");
                const notificationRationale = optionalText(body, "notificationRationale");
                return json(await transitionPrivacyBreach(tx, requiredText(body, "breachId"), {
                  status: requiredText(body, "status") as Parameters<typeof transitionPrivacyBreach>[2]["status"],
                  ...(containmentSummary ? { containmentSummary } : {}),
                  ...(typeof notificationRequired === "boolean" ? { notificationRequired } : {}),
                  ...(notificationRationale ? { notificationRationale } : {}),
                  ...(authorityNotifiedAt ? { authorityNotifiedAt } : {}),
                  ...(subjectsNotifiedAt ? { subjectsNotifiedAt } : {}),
                }));
              }
              case "propose_assurance_candidate": {
                const suggestedEvidence = optionalText(body, "suggestedEvidence");
                const input: ProposePrivacyAssuranceCandidateInput = {
                  engagementId: requiredText(body, "engagementId"),
                  privacyRecordType: requiredText(body, "privacyRecordType") as ProposePrivacyAssuranceCandidateInput["privacyRecordType"],
                  privacyRecordId: requiredText(body, "privacyRecordId"),
                  candidateType: requiredText(body, "candidateType") as ProposePrivacyAssuranceCandidateInput["candidateType"],
                  suggestedTitle: requiredText(body, "suggestedTitle"),
                  rationale: requiredText(body, "rationale"),
                  ...(suggestedEvidence ? { suggestedEvidence } : {}),
                };
                await requirePrivacyRecordInOrganization(tx, input.privacyRecordType, input.privacyRecordId);
                return json(await proposePrivacyAssuranceCandidate(tx, input), 201);
              }
              case "create_retention_rule": {
                const disposalMethod = optionalText(body, "disposalMethod");
                const legalBasisReference = optionalText(body, "legalBasisReference");
                return json(await createRetentionRule(tx, {
                  processingActivityId: requiredText(body, "processingActivityId"),
                  dataCategory: requiredText(body, "dataCategory"),
                  retentionPeriod: requiredText(body, "retentionPeriod"),
                  triggerEvent: requiredText(body, "triggerEvent"),
                  ...(disposalMethod ? { disposalMethod } : {}),
                  ...(legalBasisReference ? { legalBasisReference } : {}),
                }), 201);
              }
              case "register_notice": {
                const effectiveAt = optionalText(body, "effectiveAt");
                return json(await registerPrivacyNotice(tx, {
                  noticeKey: requiredText(body, "noticeKey"),
                  title: requiredText(body, "title"),
                  contentHash: requiredText(body, "contentHash"),
                  storageReference: requiredText(body, "storageReference"),
                  ...(effectiveAt ? { effectiveAt } : {}),
                }), 201);
              }
              case "approve_notice":
                return json(await approvePrivacyNotice(tx, requiredText(body, "noticeId")));
              case "record_consent": {
                const processingActivityId = optionalText(body, "processingActivityId");
                const noticeId = optionalText(body, "noticeId");
                return json(await recordConsent(tx, {
                  subjectReferenceHash: requiredText(body, "subjectReferenceHash"),
                  purpose: requiredText(body, "purpose"),
                  capturedAt: requiredText(body, "capturedAt"),
                  ...(processingActivityId ? { processingActivityId } : {}),
                  ...(noticeId ? { noticeId } : {}),
                }), 201);
              }
              case "withdraw_consent":
                return json(await withdrawConsent(tx, requiredText(body, "consentId")));
              case "refresh_privacy_alerts":
                return json({ createdCount: await refreshPrivacyAlerts(tx) });
              case "acknowledge_privacy_alert":
                return json(await acknowledgePrivacyAlert(tx, requiredText(body, "alertId")));
              case "resolve_privacy_alert":
                return json(await resolvePrivacyAlert(tx, requiredText(body, "alertId")));
              case "accept_assurance_candidate":
                return json(await acceptPrivacyAssuranceCandidate(tx, requiredText(body, "candidateId"), requiredText(body, "rationale")));
              case "reject_assurance_candidate":
                return json(await rejectPrivacyAssuranceCandidate(tx, requiredText(body, "candidateId"), requiredText(body, "rationale")));
              default:
                throw new Error("Unsupported privacy operation");
            }
          },
        );
      } catch (error) {
        return errorResponse(error);
      }
    },
  };
}
