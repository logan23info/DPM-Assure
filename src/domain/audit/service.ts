import "server-only";

import { sql } from "drizzle-orm";

import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions, requirePermission } from "@/auth/rbac";

export type AuditLogEntry = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_email: string | null;
  timestamp: string;
  request_id: string;
  new_values: Record<string, unknown> | null;
};

export async function listAuditLog(transaction: AuthorizedTenantTransaction, limit = 100) {
  requirePermission(transaction.membership.role, permissions.auditLogRead);
  const safeLimit = Math.max(1, Math.min(200, limit));
  const result = await transaction.db.execute<AuditLogEntry>(sql`
    select a.id, a.action, a.entity_type, a.entity_id, u.email as actor_email,
      a.timestamp::text, a.request_id, a.new_values
    from audit_logs a
    left join users u on u.id = a.actor_user_id
    where a.organization_id = ${transaction.context.organizationId}::uuid
    order by a.timestamp desc
    limit ${safeLimit}
  `);
  return result.rows;
}
