import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions, requirePermission } from "@/auth/rbac";
import { recordDomainChange } from "@/domain/record-event";
import { buildEvidenceStorageKey } from "@/storage/object-store";
import { getObjectStore } from "@/storage/s3-object-store";
import { validateEvidenceRegistration } from "@/domain/evidence/validation";
import { ClientPortalError } from "./service";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuid(v:unknown,n:string){if(typeof v!=="string"||!UUID.test(v))throw new ClientPortalError(`${n} must be a UUID`);return v;}
function text(v:unknown,n:string,max:number){if(typeof v!=="string"||!v.trim())throw new ClientPortalError(`${n} is required`);const x=v.trim();if(x.length>max)throw new ClientPortalError(`${n} must not exceed ${max} characters`);return x;}
function uploadSize(v:unknown){const n=Number(v);if(!Number.isSafeInteger(n)||n<0)throw new ClientPortalError("sizeBytes must be a non-negative safe integer");const max=Number(process.env.EVIDENCE_MAX_UPLOAD_BYTES??52_428_800);if(n>max)throw new ClientPortalError(`Evidence file exceeds maximum allowed size of ${max} bytes`);return n;}

async function requireAssignedOpenPbc(tx:AuthorizedTenantTransaction,pbcRequestId:string){
 const row=(await tx.db.execute<{engagement_id:string;workpaper_id:string|null;procedure_id:string|null;status:string}>(sql`
  select p.engagement_id,p.workpaper_id,p.procedure_id,p.status::text
  from pbc_requests p
  join engagements e on e.id=p.engagement_id
  join client_user_access cua on cua.organization_id=e.organization_id and cua.client_id=e.client_id
    and cua.user_id=${tx.principal.userId}::uuid and cua.status='ACTIVE'
  where p.id=${pbcRequestId}::uuid and p.assigned_to=${tx.principal.userId}::uuid
    and e.organization_id=${tx.context.organizationId}::uuid and e.status='TESTING'`)).rows[0];
 if(!row)throw new ClientPortalError("Assigned TESTING PBC request not found");
 if(["CLOSED","CANCELLED"].includes(row.status))throw new ClientPortalError("This PBC request no longer accepts evidence");
 if(!row.workpaper_id)throw new ClientPortalError("This PBC request is not linked to a workpaper; an auditor must link it before evidence can be uploaded");
 return row;
}

export async function createClientEvidenceUploadIntent(tx:AuthorizedTenantTransaction,input:Record<string,unknown>){
 requirePermission(tx.membership.role,permissions.clientPbcRespond);
 const pbcRequestId=uuid(input.pbcRequestId,"pbcRequestId"),filename=text(input.filename,"filename",250),mimeType=text(input.mimeType,"mimeType",200),sizeBytes=uploadSize(input.sizeBytes);
 const pbc=await requireAssignedOpenPbc(tx,pbcRequestId);const objectId=randomUUID();
 const storageKey=buildEvidenceStorageKey({organizationId:tx.context.organizationId,engagementId:pbc.engagement_id,objectId,filename});const ttlSeconds=600;const expiresAt=new Date(Date.now()+ttlSeconds*1000);
 const intent=(await tx.db.execute<{id:string}>(sql`insert into evidence_upload_intents(organization_id,engagement_id,workpaper_id,procedure_id,pbc_request_id,filename,mime_type,expected_size_bytes,storage_key,created_by,expires_at) values(${tx.context.organizationId}::uuid,${pbc.engagement_id}::uuid,${pbc.workpaper_id}::uuid,${pbc.procedure_id}::uuid,${pbcRequestId}::uuid,${filename},${mimeType},${sizeBytes},${storageKey},${tx.principal.userId}::uuid,${expiresAt}) returning id`)).rows[0];if(!intent)throw new ClientPortalError("Unable to create client evidence upload intent");
 const signed=await getObjectStore().createPutIntent({storageKey,contentType:mimeType,expiresInSeconds:ttlSeconds});
 await recordDomainChange(tx,{eventType:"client.pbc.evidence_upload_intent.created",aggregateType:"engagement",aggregateId:pbc.engagement_id,action:"client.pbc.evidence_upload_intent.create",entityType:"evidence_upload_intent",entityId:intent.id,payload:{pbcRequestId},newValues:{filename,mimeType,sizeBytes,expiresAt:expiresAt.toISOString()}});
 return {intentId:intent.id,uploadUrl:signed.uploadUrl,requiredHeaders:signed.requiredHeaders,expiresAt:signed.expiresAt.toISOString()};
}

export async function finalizeClientEvidenceUpload(tx:AuthorizedTenantTransaction,input:Record<string,unknown>){
 requirePermission(tx.membership.role,permissions.clientPbcRespond);const intentId=uuid(input.intentId,"intentId");
 const intent=(await tx.db.execute<{id:string;engagement_id:string;workpaper_id:string;procedure_id:string|null;pbc_request_id:string;filename:string;mime_type:string;expected_size_bytes:string;storage_key:string;status:string;expires_at:Date}>(sql`select id,engagement_id,workpaper_id,procedure_id,pbc_request_id,filename,mime_type,expected_size_bytes::text,storage_key,status::text,expires_at from evidence_upload_intents where id=${intentId}::uuid and organization_id=${tx.context.organizationId}::uuid and created_by=${tx.principal.userId}::uuid for update`)).rows[0];
 if(!intent)throw new ClientPortalError("Client evidence upload intent not found");if(intent.status!=="PENDING")throw new ClientPortalError(`Evidence upload intent is ${intent.status}`);if(new Date(intent.expires_at).getTime()<=Date.now()){await tx.db.execute(sql`update evidence_upload_intents set status='EXPIRED' where id=${intentId}::uuid`);throw new ClientPortalError("Evidence upload intent has expired");}
 await requireAssignedOpenPbc(tx,intent.pbc_request_id);
 const object=await getObjectStore().getObject(intent.storage_key);const expectedSize=Number(intent.expected_size_bytes);if(object.bytes.byteLength!==expectedSize)throw new ClientPortalError(`Uploaded object size mismatch: expected ${expectedSize}, received ${object.bytes.byteLength}`);if(object.metadata.contentType&&object.metadata.contentType!==intent.mime_type)throw new ClientPortalError("Uploaded object content type does not match authorized MIME type");
 const sha256=createHash("sha256").update(object.bytes).digest("hex");const sourceDescription=text(input.sourceDescription??"Submitted by assigned client user through the DPM-Assure PBC portal","sourceDescription",10_000);
 const validated=validateEvidenceRegistration({engagementId:intent.engagement_id,workpaperId:intent.workpaper_id,procedureId:intent.procedure_id??undefined,pbcRequestId:intent.pbc_request_id,filename:intent.filename,mimeType:intent.mime_type,sizeBytes:expectedSize,storageKey:intent.storage_key,sha256,sourceDescription,acquiredAt:typeof input.acquiredAt==="string"?input.acquiredAt:undefined,periodStart:typeof input.periodStart==="string"?input.periodStart:undefined,periodEnd:typeof input.periodEnd==="string"?input.periodEnd:undefined});
 const evidence=(await tx.db.execute<{id:string}>(sql`insert into evidence(organization_id,engagement_id,workpaper_id,procedure_id,pbc_request_id,filename,mime_type,size_bytes,storage_key,sha256,original_sha256,uploaded_by,source_description,acquired_at,period_start,period_end,source_type) values(${tx.context.organizationId}::uuid,${validated.engagementId}::uuid,${validated.workpaperId}::uuid,${validated.procedureId??null}::uuid,${validated.pbcRequestId??null}::uuid,${validated.filename},${validated.mimeType},${validated.sizeBytes},${validated.storageKey},${validated.sha256},${validated.sha256},${tx.principal.userId}::uuid,${validated.sourceDescription},${validated.acquiredAt??null}::timestamptz,${validated.periodStart??null}::date,${validated.periodEnd??null}::date,'CLIENT_PORTAL_UPLOAD') returning id`)).rows[0];if(!evidence)throw new ClientPortalError("Client evidence registration failed");
 await tx.db.execute(sql`insert into evidence_custody_events(organization_id,engagement_id,evidence_id,event_type,actor_user_id,sha256,notes) values(${tx.context.organizationId}::uuid,${intent.engagement_id}::uuid,${evidence.id}::uuid,'CLIENT_SUBMITTED',${tx.principal.userId}::uuid,${sha256},'Submitted through restricted client PBC portal')`);
 await tx.db.execute(sql`update evidence_upload_intents set status='FINALIZED',finalized_at=now(),evidence_id=${evidence.id}::uuid where id=${intentId}::uuid`);
 await recordDomainChange(tx,{eventType:"client.pbc.evidence_submitted",aggregateType:"engagement",aggregateId:intent.engagement_id,action:"client.pbc.evidence.submit",entityType:"evidence",entityId:evidence.id,payload:{pbcRequestId:intent.pbc_request_id,uploadIntentId:intentId},newValues:{filename:validated.filename,sha256,sizeBytes:expectedSize,sourceType:"CLIENT_PORTAL_UPLOAD"}});
 return {evidenceId:evidence.id,sha256};
}
