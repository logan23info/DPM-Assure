import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions, requirePermission } from "@/auth/rbac";
import {
  applicabilityDeterminations,
  complianceProfileFacts,
  complianceProfiles,
  obligationInstances,
} from "@/db/obligation-schema";
import { recordDomainChange } from "@/domain/record-event";

import {
  validateComplianceFact,
  validateCreateComplianceProfile,
  validateMaterializeObligation,
  type CreateComplianceProfileInput,
  type MaterializeObligationInput,
  type SetComplianceFactInput,
} from "./validation";

export async function listComplianceProfiles(transaction: AuthorizedTenantTransaction) {
  requirePermission(transaction.membership.role, permissions.complianceRead);
  return transaction.db
    .select()
    .from(complianceProfiles)
    .where(eq(complianceProfiles.organizationId, transaction.context.organizationId))
    .orderBy(asc(complianceProfiles.name));
}

export async function createComplianceProfile(
  transaction: AuthorizedTenantTransaction,
  input: CreateComplianceProfileInput,
) {
  requirePermission(transaction.membership.role, permissions.complianceProfileManage);
  const validated = validateCreateComplianceProfile(input);

  const [created] = await transaction.db
    .insert(complianceProfiles)
    .values({
      organizationId: transaction.context.organizationId,
      name: validated.name,
      jurisdiction: validated.jurisdiction,
      validatedBy: transaction.principal.userId,
    })
    .returning();
  if (!created) throw new Error("Compliance profile insert did not return a row");

  await recordDomainChange(transaction, {
    eventType: "compliance.profile.created",
    aggregateType: "compliance_profile",
    aggregateId: created.id,
    action: "compliance.profile.create",
    entityType: "compliance_profile",
    payload: { profileId: created.id, jurisdiction: created.jurisdiction },
    newValues: { name: created.name, jurisdiction: created.jurisdiction, status: created.status },
    metadata: { authoritativeLegalRuleCreated: false },
  });
  return created;
}

export async function setComplianceProfileFact(
  transaction: AuthorizedTenantTransaction,
  input: SetComplianceFactInput,
) {
  requirePermission(transaction.membership.role, permissions.complianceProfileManage);
  const validated = validateComplianceFact(input);

  const [profile] = await transaction.db
    .select({ id: complianceProfiles.id })
    .from(complianceProfiles)
    .where(and(
      eq(complianceProfiles.id, validated.profileId),
      eq(complianceProfiles.organizationId, transaction.context.organizationId),
    ))
    .limit(1);
  if (!profile) throw new Error("Compliance profile was not found in the authorized organization");

  const [fact] = await transaction.db
    .insert(complianceProfileFacts)
    .values({
      organizationId: transaction.context.organizationId,
      profileId: profile.id,
      factKey: validated.factKey,
      factValue: validated.factValue,
      sourceReference: validated.sourceReference,
      validatedBy: transaction.principal.userId,
    })
    .onConflictDoUpdate({
      target: [complianceProfileFacts.profileId, complianceProfileFacts.factKey],
      set: {
        factValue: validated.factValue,
        sourceReference: validated.sourceReference,
        validatedBy: transaction.principal.userId,
        validatedAt: new Date(),
      },
    })
    .returning();
  if (!fact) throw new Error("Compliance fact upsert did not return a row");

  await recordDomainChange(transaction, {
    eventType: "compliance.profile_fact.validated",
    aggregateType: "compliance_profile",
    aggregateId: profile.id,
    action: "compliance.profile_fact.set",
    entityType: "compliance_profile_fact",
    entityId: fact.id,
    payload: { profileId: profile.id, factKey: fact.factKey },
    newValues: { factKey: fact.factKey, factValue: fact.factValue, sourceReference: fact.sourceReference },
  });
  return fact;
}

export async function evaluateApplicability(
  transaction: AuthorizedTenantTransaction,
  profileId: string,
  obligationRuleId: string,
) {
  requirePermission(transaction.membership.role, permissions.complianceApplicabilityEvaluate);

  await transaction.db.execute(sql`
    select evaluate_obligation_rule(
      ${profileId}::uuid,
      ${obligationRuleId}::uuid,
      ${transaction.principal.userId}::uuid
    )
  `);

  const [determination] = await transaction.db
    .select()
    .from(applicabilityDeterminations)
    .where(and(
      eq(applicabilityDeterminations.organizationId, transaction.context.organizationId),
      eq(applicabilityDeterminations.profileId, profileId),
      eq(applicabilityDeterminations.obligationRuleId, obligationRuleId),
    ))
    .limit(1);
  if (!determination) throw new Error("Applicability evaluation did not produce a determination");

  await recordDomainChange(transaction, {
    eventType: "compliance.applicability.evaluated",
    aggregateType: "applicability_determination",
    aggregateId: determination.id,
    action: "compliance.applicability.evaluate",
    entityType: "applicability_determination",
    payload: {
      determinationId: determination.id,
      profileId: determination.profileId,
      obligationRuleId: determination.obligationRuleId,
      result: determination.result,
    },
    newValues: { result: determination.result, rationale: determination.rationale },
    metadata: { deterministic: true, aiUsed: false },
  });
  return determination;
}

export async function materializeObligation(
  transaction: AuthorizedTenantTransaction,
  input: MaterializeObligationInput,
) {
  requirePermission(transaction.membership.role, permissions.complianceObligationMaterialize);
  const validated = validateMaterializeObligation(input);

  await transaction.db.execute(sql`
    select materialize_obligation_instance(
      ${validated.determinationId}::uuid,
      ${validated.triggerAt}::timestamptz,
      ${transaction.principal.userId}::uuid,
      ${validated.privacyRecordType ?? null}::text,
      ${validated.privacyRecordId ?? null}::uuid
    )
  `);

  const [obligation] = await transaction.db
    .select()
    .from(obligationInstances)
    .where(and(
      eq(obligationInstances.organizationId, transaction.context.organizationId),
      eq(obligationInstances.applicabilityDeterminationId, validated.determinationId),
      eq(obligationInstances.triggerAt, validated.triggerAt),
    ))
    .limit(1);
  if (!obligation) throw new Error("Obligation materialization did not return a tenant obligation");

  await recordDomainChange(transaction, {
    eventType: "compliance.obligation.materialized",
    aggregateType: "obligation_instance",
    aggregateId: obligation.id,
    action: "compliance.obligation.materialize",
    entityType: "obligation_instance",
    payload: {
      obligationId: obligation.id,
      determinationId: obligation.applicabilityDeterminationId,
      ruleId: obligation.obligationRuleId,
      triggerAt: obligation.triggerAt,
      dueAt: obligation.dueAt,
    },
    newValues: { status: obligation.status, dueAt: obligation.dueAt, sourceReference: obligation.sourceReference },
    metadata: { dueDateCallerSupplied: false, aiUsed: false },
  });
  return obligation;
}

export async function listOpenObligations(transaction: AuthorizedTenantTransaction) {
  requirePermission(transaction.membership.role, permissions.complianceRead);
  return transaction.db
    .select()
    .from(obligationInstances)
    .where(and(
      eq(obligationInstances.organizationId, transaction.context.organizationId),
      eq(obligationInstances.status, "OPEN"),
    ))
    .orderBy(asc(obligationInstances.dueAt));
}
