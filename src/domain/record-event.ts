import "server-only";

import { auditLogs, domainEvents } from "@/db/schema";
import type { AuthorizedTenantTransaction } from "@/auth/authorize";

export interface RecordedDomainChange {
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string;
  readonly payload: Record<string, unknown>;
  readonly oldValues?: Record<string, unknown> | null;
  readonly newValues?: Record<string, unknown> | null;
  readonly metadata?: Record<string, unknown>;
}

export async function recordDomainChange(
  transaction: AuthorizedTenantTransaction,
  change: RecordedDomainChange,
): Promise<void> {
  const { db, context, principal } = transaction;

  await db.insert(domainEvents).values({
    organizationId: context.organizationId,
    eventType: change.eventType,
    aggregateType: change.aggregateType,
    aggregateId: change.aggregateId,
    actorUserId: principal.userId,
    payload: change.payload,
    requestId: context.requestId,
  });

  await db.insert(auditLogs).values({
    organizationId: context.organizationId,
    actorUserId: principal.userId,
    action: change.action,
    entityType: change.entityType,
    entityId: change.entityId ?? change.aggregateId,
    requestId: context.requestId,
    oldValues: change.oldValues ?? null,
    newValues: change.newValues ?? null,
    metadata: change.metadata ?? {},
  });
}
