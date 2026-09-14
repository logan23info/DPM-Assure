import "server-only";

import { asc, eq } from "drizzle-orm";

import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions, requirePermission } from "@/auth/rbac";
import { engagements } from "@/db/schema";
import { recordDomainChange } from "@/domain/record-event";

import {
  validateCreateEngagementInput,
  type CreateEngagementInput,
} from "./validation";

export interface EngagementSummary {
  readonly id: string;
  readonly clientId: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: "PLANNING" | "TESTING" | "REVIEW" | "CLOSED";
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly leadAuditorId: string | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly frozenAt: Date | null;
}

export async function listEngagements(
  transaction: AuthorizedTenantTransaction,
): Promise<readonly EngagementSummary[]> {
  requirePermission(transaction.membership.role, permissions.engagementRead);

  return transaction.db
    .select({
      id: engagements.id,
      clientId: engagements.clientId,
      name: engagements.name,
      description: engagements.description,
      status: engagements.status,
      startDate: engagements.startDate,
      endDate: engagements.endDate,
      leadAuditorId: engagements.leadAuditorId,
      createdBy: engagements.createdBy,
      createdAt: engagements.createdAt,
      updatedAt: engagements.updatedAt,
      frozenAt: engagements.frozenAt,
    })
    .from(engagements)
    .where(eq(engagements.organizationId, transaction.context.organizationId))
    .orderBy(asc(engagements.name));
}

export async function createEngagement(
  transaction: AuthorizedTenantTransaction,
  input: CreateEngagementInput,
): Promise<EngagementSummary> {
  requirePermission(transaction.membership.role, permissions.engagementCreate);

  const validated = validateCreateEngagementInput(input);

  const [created] = await transaction.db
    .insert(engagements)
    .values({
      organizationId: transaction.context.organizationId,
      clientId: validated.clientId,
      name: validated.name,
      description: validated.description,
      status: "PLANNING",
      startDate: validated.startDate,
      endDate: validated.endDate,
      leadAuditorId: validated.leadAuditorId,
      createdBy: transaction.principal.userId,
    })
    .returning({
      id: engagements.id,
      clientId: engagements.clientId,
      name: engagements.name,
      description: engagements.description,
      status: engagements.status,
      startDate: engagements.startDate,
      endDate: engagements.endDate,
      leadAuditorId: engagements.leadAuditorId,
      createdBy: engagements.createdBy,
      createdAt: engagements.createdAt,
      updatedAt: engagements.updatedAt,
      frozenAt: engagements.frozenAt,
    });

  if (!created) {
    throw new Error("Engagement insert did not return a row");
  }

  await recordDomainChange(transaction, {
    eventType: "engagement.created",
    aggregateType: "engagement",
    aggregateId: created.id,
    action: "engagement.create",
    entityType: "engagement",
    entityId: created.id,
    payload: {
      engagementId: created.id,
      clientId: created.clientId,
      status: created.status,
    },
    newValues: {
      id: created.id,
      organizationId: transaction.context.organizationId,
      clientId: created.clientId,
      name: created.name,
      description: created.description,
      status: created.status,
      startDate: created.startDate,
      endDate: created.endDate,
      leadAuditorId: created.leadAuditorId,
      createdBy: created.createdBy,
    },
  });

  return created;
}
