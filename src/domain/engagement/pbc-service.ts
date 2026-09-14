import "server-only";

import { sql } from "drizzle-orm";

import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions, requirePermission } from "@/auth/rbac";
import { recordDomainChange } from "@/domain/record-event";

export class PbcCompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PbcCompletionError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new PbcCompletionError(`${name} must be a UUID`);
  }
  return value;
}

export async function completePbcRequest(
  transaction: AuthorizedTenantTransaction,
  input: Record<string, unknown>,
) {
  requirePermission(transaction.membership.role, permissions.workpaperUpdate);
  const pbcRequestId = uuid(input.pbcRequestId, "pbcRequestId");

  const request = (
    await transaction.db.execute<{
      engagement_id: string;
      status: string;
    }>(sql`
      select p.engagement_id, p.status::text
      from pbc_requests p
      join engagements e on e.id = p.engagement_id
      where p.id = ${pbcRequestId}::uuid
        and e.organization_id = ${transaction.context.organizationId}::uuid
      for update of p
    `)
  ).rows[0];

  if (!request) throw new PbcCompletionError("PBC request not found");
  if (request.status === "COMPLETED") {
    throw new PbcCompletionError("PBC request is already completed");
  }
  if (["CLOSED", "CANCELLED"].includes(request.status)) {
    throw new PbcCompletionError(`PBC request cannot be completed from status ${request.status}`);
  }

  const engagement = (
    await transaction.db.execute<{ status: string }>(sql`
      select status::text
      from engagements
      where id = ${request.engagement_id}::uuid
        and organization_id = ${transaction.context.organizationId}::uuid
    `)
  ).rows[0];

  if (!engagement || engagement.status !== "TESTING") {
    throw new PbcCompletionError("PBC completion is only allowed while the engagement is in TESTING");
  }

  const evidence = (
    await transaction.db.execute<{ uploaded_by: string }>(sql`
      select uploaded_by
      from evidence
      where pbc_request_id = ${pbcRequestId}::uuid
        and organization_id = ${transaction.context.organizationId}::uuid
        and status = 'ACTIVE'
      order by uploaded_at desc, id desc
      limit 1
    `)
  ).rows[0];

  if (!evidence) {
    throw new PbcCompletionError("PBC request cannot be completed until active evidence is linked");
  }

  const completedAt = new Date();
  await transaction.db.execute(sql`
    update pbc_requests
    set status = 'COMPLETED',
        fulfilled_by = ${evidence.uploaded_by}::uuid,
        fulfilled_at = ${completedAt},
        updated_at = now()
    where id = ${pbcRequestId}::uuid
  `);

  await recordDomainChange(transaction, {
    eventType: "engagement.pbc.completed",
    aggregateType: "engagement",
    aggregateId: request.engagement_id,
    action: "engagement.pbc.complete",
    entityType: "pbc_request",
    entityId: pbcRequestId,
    payload: { pbcRequestId },
    oldValues: { status: request.status },
    newValues: {
      status: "COMPLETED",
      fulfilledBy: evidence.uploaded_by,
      fulfilledAt: completedAt.toISOString(),
    },
  });

  return {
    id: pbcRequestId,
    status: "COMPLETED" as const,
    fulfilledBy: evidence.uploaded_by,
    fulfilledAt: completedAt.toISOString(),
  };
}
