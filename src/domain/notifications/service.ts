import "server-only";

import { sql } from "drizzle-orm";
import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { recordDomainChange } from "@/domain/record-event";

export interface NotificationInput { recipientUserId:string; eventType:string; title:string; body:string; }
function clean(value:string,name:string,max:number){const v=value.trim();if(!v)throw new Error(`${name} is required`);if(v.length>max)throw new Error(`${name} must not exceed ${max} characters`);return v;}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function createNotification(tx:AuthorizedTenantTransaction,input:NotificationInput){
 if(!UUID.test(input.recipientUserId))throw new Error("recipientUserId must be a UUID");
 const membership=(await tx.db.execute<{ok:boolean}>(sql`select exists(select 1 from memberships where organization_id=${tx.context.organizationId}::uuid and user_id=${input.recipientUserId}::uuid and status='ACTIVE') as ok`)).rows[0]?.ok;
 if(!membership)throw new Error("Notification recipient must be an active organization member");
 const eventType=clean(input.eventType,"eventType",150),title=clean(input.title,"title",500),body=clean(input.body,"body",10_000);
 const row=(await tx.db.execute<{id:string}>(sql`insert into notifications(organization_id,recipient_user_id,event_type,title,body) values(${tx.context.organizationId}::uuid,${input.recipientUserId}::uuid,${eventType},${title},${body}) returning id`)).rows[0];
 if(!row)throw new Error("Notification write failed");return row;
}

export async function notifyActiveRoles(tx:AuthorizedTenantTransaction,input:{roles:string[];eventType:string;title:string;body:string}){
 const rows=await tx.db.execute<{user_id:string}>(sql`select user_id from memberships where organization_id=${tx.context.organizationId}::uuid and status='ACTIVE' and role::text=any(${input.roles}::text[])`);
 const created=[];for(const row of rows.rows)created.push(await createNotification(tx,{recipientUserId:row.user_id,eventType:input.eventType,title:input.title,body:input.body}));return created;
}

export async function listMyNotifications(tx:AuthorizedTenantTransaction,limit=50){
 const safe=Math.max(1,Math.min(100,limit));const result=await tx.db.execute<{id:string;event_type:string;title:string;body:string;status:string;created_at:string;read_at:string|null}>(sql`select id,event_type,title,body,status,created_at::text,read_at::text from notifications where organization_id=${tx.context.organizationId}::uuid and recipient_user_id=${tx.principal.userId}::uuid order by created_at desc limit ${safe}`);return result.rows;
}

export async function markNotificationRead(tx:AuthorizedTenantTransaction,notificationId:string){
 if(!UUID.test(notificationId))throw new Error("notificationId must be a UUID");
 const row=(await tx.db.execute<{id:string}>(sql`update notifications set status='READ',read_at=coalesce(read_at,now()) where id=${notificationId}::uuid and organization_id=${tx.context.organizationId}::uuid and recipient_user_id=${tx.principal.userId}::uuid returning id`)).rows[0];if(!row)throw new Error("Notification not found");
 await recordDomainChange(tx,{eventType:"notification.read",aggregateType:"notification",aggregateId:notificationId,action:"notification.read",entityType:"notification",entityId:notificationId,payload:{},newValues:{status:"READ"}});return row;
}
