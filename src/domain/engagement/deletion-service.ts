import "server-only";
import { sql } from "drizzle-orm";
import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions, requirePermission } from "@/auth/rbac";
import { getObjectStore } from "@/storage/s3-object-store";

export async function deletePlanningEngagement(tx: AuthorizedTenantTransaction, engagementId: string, confirmation: string) {
  requirePermission(tx.membership.role, permissions.engagementUpdate);
  const row=(await tx.db.execute<{name:string;status:string}>(sql`select name,status::text from engagements where id=${engagementId}::uuid and organization_id=${tx.context.organizationId}::uuid`)).rows[0];
  if(!row) throw new Error("Engagement not found");
  if(row.status!=="PLANNING") throw new Error("Only PLANNING engagements may be permanently deleted");
  if(confirmation!==row.name) throw new Error("Confirmation does not match engagement name");
  const evidence=(await tx.db.execute<{storage_key:string}>(sql`select storage_key from evidence where engagement_id=${engagementId}::uuid`)).rows;
  for(const item of evidence) await getObjectStore().deleteObject(item.storage_key);
  await tx.db.execute(sql`delete from engagements where id=${engagementId}::uuid and organization_id=${tx.context.organizationId}::uuid`);
  return { id: engagementId, deleted: true };
}
