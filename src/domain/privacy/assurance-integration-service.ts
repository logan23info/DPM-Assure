import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions, requirePermission } from "@/auth/rbac";
import { privacyAssuranceCandidates } from "@/db/privacy-assurance-schema";
import { recordDomainChange } from "@/domain/record-event";

import {
  validatePrivacyAssuranceCandidateInput,
  validatePrivacyAssuranceDecisionRationale,
  type ProposePrivacyAssuranceCandidateInput,
} from "./assurance-integration-validation";

export async function listPrivacyAssuranceCandidates(
  transaction: AuthorizedTenantTransaction,
  engagementId: string,
) {
  requirePermission(transaction.membership.role, permissions.privacyRead);

  return transaction.db
    .select()
    .from(privacyAssuranceCandidates)
    .where(
      and(
        eq(privacyAssuranceCandidates.organizationId, transaction.context.organizationId),
        eq(privacyAssuranceCandidates.engagementId, engagementId),
      ),
    )
    .orderBy(desc(privacyAssuranceCandidates.proposedAt));
}

export async function proposePrivacyAssuranceCandidate(
  transaction: AuthorizedTenantTransaction,
  input: ProposePrivacyAssuranceCandidateInput,
) {
  requirePermission(transaction.membership.role, permissions.privacyAssurancePropose);
  const validated = validatePrivacyAssuranceCandidateInput(input);

  const [created] = await transaction.db
    .insert(privacyAssuranceCandidates)
    .values({
      organizationId: transaction.context.organizationId,
      engagementId: validated.engagementId,
      privacyRecordType: validated.privacyRecordType,
      privacyRecordId: validated.privacyRecordId,
      candidateType: validated.candidateType,
      suggestedTitle: validated.suggestedTitle,
      rationale: validated.rationale,
      suggestedEvidence: validated.suggestedEvidence ?? null,
      proposedBy: transaction.principal.userId,
    })
    .returning();

  if (!created) throw new Error("Privacy assurance candidate insert did not return a row");

  await recordDomainChange(transaction, {
    eventType: "privacy.assurance_candidate.proposed",
    aggregateType: "privacy_assurance_candidate",
    aggregateId: created.id,
    action: "privacy.assurance_candidate.propose",
    entityType: "privacy_assurance_candidate",
    payload: {
      candidateId: created.id,
      engagementId: created.engagementId,
      privacyRecordType: created.privacyRecordType,
      privacyRecordId: created.privacyRecordId,
      candidateType: created.candidateType,
    },
    newValues: {
      status: created.status,
      suggestedTitle: created.suggestedTitle,
      candidateType: created.candidateType,
    },
    metadata: {
      operationalRecordRemainsSourceOfTruth: true,
      createsAssuranceConclusion: false,
    },
  });

  return created;
}

async function requireProposedCandidate(
  transaction: AuthorizedTenantTransaction,
  candidateId: string,
) {
  const [candidate] = await transaction.db
    .select()
    .from(privacyAssuranceCandidates)
    .where(
      and(
        eq(privacyAssuranceCandidates.id, candidateId),
        eq(privacyAssuranceCandidates.organizationId, transaction.context.organizationId),
      ),
    )
    .limit(1);

  if (!candidate) throw new Error("Privacy assurance candidate was not found in the authorized organization");
  if (candidate.status !== "PROPOSED") throw new Error("Only PROPOSED privacy assurance candidates may be decided");
  if (candidate.proposedBy === transaction.principal.userId) {
    throw new Error("Privacy assurance candidate proposer cannot decide the same candidate");
  }
  return candidate;
}

export async function acceptPrivacyAssuranceCandidate(
  transaction: AuthorizedTenantTransaction,
  candidateId: string,
  rationale: string,
) {
  requirePermission(transaction.membership.role, permissions.privacyAssuranceDecide);
  const decisionRationale = validatePrivacyAssuranceDecisionRationale(rationale);
  const candidate = await requireProposedCandidate(transaction, candidateId);

  await transaction.db.execute(sql`
    select accept_privacy_assurance_candidate(
      ${candidate.id}::uuid,
      ${transaction.principal.userId}::uuid,
      ${decisionRationale}::text
    )
  `);

  const [accepted] = await transaction.db
    .select()
    .from(privacyAssuranceCandidates)
    .where(eq(privacyAssuranceCandidates.id, candidate.id))
    .limit(1);
  if (!accepted || accepted.status !== "ACCEPTED") {
    throw new Error("Privacy assurance candidate acceptance did not produce an accepted candidate");
  }

  await recordDomainChange(transaction, {
    eventType: "privacy.assurance_candidate.accepted",
    aggregateType: "privacy_assurance_candidate",
    aggregateId: accepted.id,
    action: "privacy.assurance_candidate.accept",
    entityType: "privacy_assurance_candidate",
    payload: {
      candidateId: accepted.id,
      engagementId: accepted.engagementId,
      candidateType: accepted.candidateType,
      scopeId: accepted.scopeId,
      pbcRequestId: accepted.pbcRequestId,
    },
    oldValues: { status: candidate.status },
    newValues: {
      status: accepted.status,
      decidedBy: accepted.decidedBy,
      scopeId: accepted.scopeId,
      pbcRequestId: accepted.pbcRequestId,
    },
    metadata: {
      humanDecisionRequired: true,
      createsAssuranceConclusion: false,
    },
  });

  return accepted;
}

export async function rejectPrivacyAssuranceCandidate(
  transaction: AuthorizedTenantTransaction,
  candidateId: string,
  rationale: string,
) {
  requirePermission(transaction.membership.role, permissions.privacyAssuranceDecide);
  const decisionRationale = validatePrivacyAssuranceDecisionRationale(rationale);
  const candidate = await requireProposedCandidate(transaction, candidateId);

  await transaction.db.execute(sql`
    select reject_privacy_assurance_candidate(
      ${candidate.id}::uuid,
      ${transaction.principal.userId}::uuid,
      ${decisionRationale}::text
    )
  `);

  const [rejected] = await transaction.db
    .select()
    .from(privacyAssuranceCandidates)
    .where(eq(privacyAssuranceCandidates.id, candidate.id))
    .limit(1);
  if (!rejected || rejected.status !== "REJECTED") {
    throw new Error("Privacy assurance candidate rejection did not produce a rejected candidate");
  }

  await recordDomainChange(transaction, {
    eventType: "privacy.assurance_candidate.rejected",
    aggregateType: "privacy_assurance_candidate",
    aggregateId: rejected.id,
    action: "privacy.assurance_candidate.reject",
    entityType: "privacy_assurance_candidate",
    payload: {
      candidateId: rejected.id,
      engagementId: rejected.engagementId,
      candidateType: rejected.candidateType,
    },
    oldValues: { status: candidate.status },
    newValues: { status: rejected.status, decidedBy: rejected.decidedBy },
    metadata: {
      humanDecisionRequired: true,
      createsAssuranceConclusion: false,
    },
  });

  return rejected;
}
