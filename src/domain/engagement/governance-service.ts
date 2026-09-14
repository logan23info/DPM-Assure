import "server-only";

import { and, desc, eq, sql } from "drizzle-orm";

import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions, requirePermission } from "@/auth/rbac";
import { engagementAssignments } from "@/db/governance-schema";
import {
  auditPlans,
  engagements,
  independenceChecks,
  memberships,
  riskAssessments,
} from "@/db/schema";
import { recordDomainChange } from "@/domain/record-event";

import {
  validateAssignmentInput,
  validateCreateAuditPlanInput,
  validateEntityId,
  validateIndependenceCheckInput,
  validateRiskAssessmentInput,
  type ApproveAuditPlanInput,
  type AssignEngagementUserInput,
  type CreateAuditPlanInput,
  type RecordIndependenceCheckInput,
  type RecordRiskAssessmentInput,
  type ResolveIndependenceConflictInput,
  type StartTestingInput,
} from "./governance-validation";

export class EngagementGovernanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngagementGovernanceError";
  }
}

async function requirePlanningEngagement(
  transaction: AuthorizedTenantTransaction,
  engagementId: string,
): Promise<void> {
  const [engagement] = await transaction.db
    .select({ id: engagements.id, status: engagements.status })
    .from(engagements)
    .where(
      and(
        eq(engagements.id, engagementId),
        eq(engagements.organizationId, transaction.context.organizationId),
      ),
    )
    .limit(1);

  if (!engagement) throw new EngagementGovernanceError("Engagement not found");
  if (engagement.status !== "PLANNING") {
    throw new EngagementGovernanceError(
      `Governance preparation is only allowed in PLANNING; current status is ${engagement.status}`,
    );
  }
}

export async function assignEngagementUser(
  transaction: AuthorizedTenantTransaction,
  input: AssignEngagementUserInput,
) {
  requirePermission(
    transaction.membership.role,
    permissions.engagementGovernanceManage,
  );
  const validated = validateAssignmentInput(input);
  await requirePlanningEngagement(transaction, validated.engagementId);

  const [membership] = await transaction.db
    .select({ role: memberships.role, status: memberships.status })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, transaction.context.organizationId),
        eq(memberships.userId, validated.userId),
      ),
    )
    .limit(1);

  if (!membership || membership.status !== "ACTIVE") {
    throw new EngagementGovernanceError(
      "Assigned user must have an active membership in the organization",
    );
  }
  if (membership.role !== validated.assignmentRole) {
    throw new EngagementGovernanceError(
      "Assignment role must match the user's active organization membership role",
    );
  }

  const [assigned] = await transaction.db
    .insert(engagementAssignments)
    .values({
      engagementId: validated.engagementId,
      userId: validated.userId,
      assignmentRole: validated.assignmentRole,
      assignedBy: transaction.principal.userId,
    })
    .onConflictDoUpdate({
      target: [
        engagementAssignments.engagementId,
        engagementAssignments.userId,
      ],
      set: {
        assignmentRole: validated.assignmentRole,
        active: true,
        assignedBy: transaction.principal.userId,
        assignedAt: new Date(),
        endedAt: null,
      },
    })
    .returning();

  if (!assigned) throw new EngagementGovernanceError("Assignment write failed");

  await recordDomainChange(transaction, {
    eventType: "engagement.assignment.upserted",
    aggregateType: "engagement",
    aggregateId: validated.engagementId,
    action: "engagement.assignment.upsert",
    entityType: "engagement_assignment",
    entityId: assigned.id,
    payload: {
      engagementId: validated.engagementId,
      userId: validated.userId,
      assignmentRole: validated.assignmentRole,
    },
    newValues: {
      userId: validated.userId,
      assignmentRole: validated.assignmentRole,
      active: true,
    },
  });

  return assigned;
}

export async function recordIndependenceCheck(
  transaction: AuthorizedTenantTransaction,
  input: RecordIndependenceCheckInput,
) {
  requirePermission(
    transaction.membership.role,
    permissions.engagementGovernanceManage,
  );
  const validated = validateIndependenceCheckInput(input);
  await requirePlanningEngagement(transaction, validated.engagementId);

  const [assignment] = await transaction.db
    .select({ id: engagementAssignments.id })
    .from(engagementAssignments)
    .where(
      and(
        eq(engagementAssignments.engagementId, validated.engagementId),
        eq(engagementAssignments.userId, validated.subjectUserId),
        eq(engagementAssignments.active, true),
      ),
    )
    .limit(1);

  if (!assignment) {
    throw new EngagementGovernanceError(
      "Independence checks may only be recorded for active engagement assignees",
    );
  }

  const [created] = await transaction.db
    .insert(independenceChecks)
    .values({
      engagementId: validated.engagementId,
      subjectUserId: validated.subjectUserId,
      result: validated.result,
      conflictDetails: validated.conflictDetails,
    })
    .returning();

  if (!created) throw new EngagementGovernanceError("Independence check write failed");

  await recordDomainChange(transaction, {
    eventType: "engagement.independence.recorded",
    aggregateType: "engagement",
    aggregateId: validated.engagementId,
    action: "engagement.independence.record",
    entityType: "independence_check",
    entityId: created.id,
    payload: {
      engagementId: validated.engagementId,
      subjectUserId: validated.subjectUserId,
      result: validated.result,
    },
    newValues: {
      subjectUserId: validated.subjectUserId,
      result: validated.result,
      conflictDetails: validated.conflictDetails,
    },
  });

  return created;
}

export async function resolveIndependenceConflict(
  transaction: AuthorizedTenantTransaction,
  input: ResolveIndependenceConflictInput,
) {
  requirePermission(
    transaction.membership.role,
    permissions.engagementStartTesting,
  );
  const checkId = validateEntityId(
    input.independenceCheckId,
    "independenceCheckId",
  );

  const [existing] = await transaction.db
    .select({
      id: independenceChecks.id,
      engagementId: independenceChecks.engagementId,
      result: independenceChecks.result,
      resolvedBy: independenceChecks.resolvedBy,
      resolvedAt: independenceChecks.resolvedAt,
    })
    .from(independenceChecks)
    .where(eq(independenceChecks.id, checkId))
    .limit(1);

  if (!existing) throw new EngagementGovernanceError("Independence check not found");
  await requirePlanningEngagement(transaction, existing.engagementId);
  if (existing.result !== "CONFLICT") {
    throw new EngagementGovernanceError("Only CONFLICT checks can be resolved");
  }
  if (existing.resolvedAt) {
    throw new EngagementGovernanceError("Independence conflict is already resolved");
  }

  const resolvedAt = new Date();
  const [resolved] = await transaction.db
    .update(independenceChecks)
    .set({ resolvedBy: transaction.principal.userId, resolvedAt })
    .where(eq(independenceChecks.id, checkId))
    .returning();

  if (!resolved) throw new EngagementGovernanceError("Conflict resolution failed");

  await recordDomainChange(transaction, {
    eventType: "engagement.independence.resolved",
    aggregateType: "engagement",
    aggregateId: existing.engagementId,
    action: "engagement.independence.resolve",
    entityType: "independence_check",
    entityId: checkId,
    payload: { engagementId: existing.engagementId, independenceCheckId: checkId },
    oldValues: { resolvedBy: existing.resolvedBy, resolvedAt: existing.resolvedAt },
    newValues: {
      resolvedBy: transaction.principal.userId,
      resolvedAt: resolvedAt.toISOString(),
    },
  });

  return resolved;
}

export async function recordRiskAssessment(
  transaction: AuthorizedTenantTransaction,
  input: RecordRiskAssessmentInput,
) {
  requirePermission(
    transaction.membership.role,
    permissions.engagementGovernanceManage,
  );
  const validated = validateRiskAssessmentInput(input);
  await requirePlanningEngagement(transaction, validated.engagementId);

  const [created] = await transaction.db
    .insert(riskAssessments)
    .values({
      engagementId: validated.engagementId,
      methodVersion: validated.methodVersion,
      inherentScore: validated.inherentScore?.toString() ?? null,
      controlScore: validated.controlScore?.toString() ?? null,
      residualScore: validated.residualScore?.toString() ?? null,
      rationale: validated.rationale,
      assessedBy: transaction.principal.userId,
    })
    .returning();

  if (!created) throw new EngagementGovernanceError("Risk assessment write failed");

  await recordDomainChange(transaction, {
    eventType: "engagement.risk_assessed",
    aggregateType: "engagement",
    aggregateId: validated.engagementId,
    action: "engagement.risk_assess",
    entityType: "risk_assessment",
    entityId: created.id,
    payload: {
      engagementId: validated.engagementId,
      methodVersion: validated.methodVersion,
    },
    newValues: {
      methodVersion: validated.methodVersion,
      inherentScore: validated.inherentScore,
      controlScore: validated.controlScore,
      residualScore: validated.residualScore,
      rationale: validated.rationale,
    },
  });

  return created;
}

export async function createAuditPlan(
  transaction: AuthorizedTenantTransaction,
  input: CreateAuditPlanInput,
) {
  requirePermission(
    transaction.membership.role,
    permissions.engagementGovernanceManage,
  );
  const validated = validateCreateAuditPlanInput(input);
  await requirePlanningEngagement(transaction, validated.engagementId);

  const [latest] = await transaction.db
    .select({ version: auditPlans.version })
    .from(auditPlans)
    .where(eq(auditPlans.engagementId, validated.engagementId))
    .orderBy(desc(auditPlans.version))
    .limit(1);

  const version = (latest?.version ?? 0) + 1;
  const [created] = await transaction.db
    .insert(auditPlans)
    .values({
      engagementId: validated.engagementId,
      version,
      status: "PENDING",
      objectives: validated.objectives,
      scopeSummary: validated.scopeSummary,
      samplingApproach: validated.samplingApproach,
      createdBy: transaction.principal.userId,
    })
    .returning();

  if (!created) throw new EngagementGovernanceError("Audit plan write failed");

  await recordDomainChange(transaction, {
    eventType: "engagement.audit_plan.created",
    aggregateType: "engagement",
    aggregateId: validated.engagementId,
    action: "engagement.audit_plan.create",
    entityType: "audit_plan",
    entityId: created.id,
    payload: { engagementId: validated.engagementId, version },
    newValues: {
      version,
      status: "PENDING",
      objectives: validated.objectives,
      scopeSummary: validated.scopeSummary,
      samplingApproach: validated.samplingApproach,
      createdBy: transaction.principal.userId,
    },
  });

  return created;
}

export async function approveAuditPlan(
  transaction: AuthorizedTenantTransaction,
  input: ApproveAuditPlanInput,
) {
  requirePermission(
    transaction.membership.role,
    permissions.engagementPlanApprove,
  );
  const auditPlanId = validateEntityId(input.auditPlanId, "auditPlanId");

  const [existing] = await transaction.db
    .select({
      id: auditPlans.id,
      engagementId: auditPlans.engagementId,
      version: auditPlans.version,
      status: auditPlans.status,
      createdBy: auditPlans.createdBy,
    })
    .from(auditPlans)
    .where(eq(auditPlans.id, auditPlanId))
    .limit(1);

  if (!existing) throw new EngagementGovernanceError("Audit plan not found");
  await requirePlanningEngagement(transaction, existing.engagementId);
  if (existing.status !== "PENDING" && existing.status !== "IN_REVIEW") {
    throw new EngagementGovernanceError(
      `Audit plan cannot be approved from status ${existing.status}`,
    );
  }
  if (existing.createdBy === transaction.principal.userId) {
    throw new EngagementGovernanceError(
      "Audit plan creator cannot approve the same plan",
    );
  }

  const approvedAt = new Date();
  const [approved] = await transaction.db
    .update(auditPlans)
    .set({
      status: "APPROVED",
      approvedBy: transaction.principal.userId,
      approvedAt,
    })
    .where(eq(auditPlans.id, auditPlanId))
    .returning();

  if (!approved) throw new EngagementGovernanceError("Audit plan approval failed");

  await recordDomainChange(transaction, {
    eventType: "engagement.audit_plan.approved",
    aggregateType: "engagement",
    aggregateId: existing.engagementId,
    action: "engagement.audit_plan.approve",
    entityType: "audit_plan",
    entityId: auditPlanId,
    payload: { engagementId: existing.engagementId, version: existing.version },
    oldValues: { status: existing.status },
    newValues: {
      status: "APPROVED",
      approvedBy: transaction.principal.userId,
      approvedAt: approvedAt.toISOString(),
    },
  });

  return approved;
}

export interface GovernanceReadiness {
  readonly ready: boolean;
}

export async function getGovernanceReadiness(
  transaction: AuthorizedTenantTransaction,
  engagementId: string,
): Promise<GovernanceReadiness> {
  requirePermission(transaction.membership.role, permissions.engagementRead);
  validateEntityId(engagementId, "engagementId");

  const result = await transaction.db.execute<{ ready: boolean }>(
    sql`select engagement_governance_ready(${engagementId}::uuid) as ready`,
  );
  return { ready: result.rows[0]?.ready === true };
}

export async function startEngagementTesting(
  transaction: AuthorizedTenantTransaction,
  input: StartTestingInput,
) {
  requirePermission(
    transaction.membership.role,
    permissions.engagementStartTesting,
  );
  const engagementId = validateEntityId(input.engagementId, "engagementId");
  await requirePlanningEngagement(transaction, engagementId);

  const readiness = await getGovernanceReadiness(transaction, engagementId);
  if (!readiness.ready) {
    throw new EngagementGovernanceError(
      "Engagement cannot enter TESTING until all governance gates pass",
    );
  }

  const [updated] = await transaction.db
    .update(engagements)
    .set({ status: "TESTING", updatedAt: new Date() })
    .where(
      and(
        eq(engagements.id, engagementId),
        eq(engagements.organizationId, transaction.context.organizationId),
        eq(engagements.status, "PLANNING"),
      ),
    )
    .returning();

  if (!updated) {
    throw new EngagementGovernanceError("Engagement transition to TESTING failed");
  }

  await recordDomainChange(transaction, {
    eventType: "engagement.testing_started",
    aggregateType: "engagement",
    aggregateId: engagementId,
    action: "engagement.start_testing",
    entityType: "engagement",
    entityId: engagementId,
    payload: { engagementId, from: "PLANNING", to: "TESTING" },
    oldValues: { status: "PLANNING" },
    newValues: { status: "TESTING" },
  });

  return updated;
}
