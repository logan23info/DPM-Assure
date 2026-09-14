import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions, requirePermission } from "@/auth/rbac";
import { recordDomainChange } from "@/domain/record-event";
import { buildEvidenceStorageKey } from "@/storage/object-store";
import { getObjectStore } from "@/storage/s3-object-store";
import { registerEvidence } from "./service";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuid(value:unknown,name:string):string{if(typeof value!=="string"||!UUID.test(value))throw new Error(`${name} must be a UUID`);return value;}
function text(value:unknown,name:string,max:number):string{if(typeof value!=="string"||!value.trim())throw new Error(`${name} is required`);const result=value.trim();if(result.length>max)throw new Error(`${name} must not exceed ${max} characters`);return result;}
function positiveSize(value:unknown):number{const size=Number(value);if(!Number.isSafeInteger(size)||size<0)throw new Error("sizeBytes must be a non-negative safe integer");const max=Number(process.env.EVIDENCE_MAX_UPLOAD_BYTES??52_428_800);if(size>max)throw new Error(`Evidence file exceeds maximum allowed size of ${max} bytes`);return size;}
async function requireTesting(tx:AuthorizedTenantTransaction,engagementId:string){const r=await tx.db.execute<{status:string}>(sql`select status::text from engagements where id=${engagementId}::uuid and organization_id=${tx.context.organizationId}::uuid`);if(!r.rows[0])throw new Error("Engagement not found");if(r.rows[0].status!=="TESTING")throw new Error("Evidence upload is only allowed in TESTING");}

export async function createEvidenceUploadIntent(tx:AuthorizedTenantTransaction,input:Record<string,unknown>){
 requirePermission(tx.membership.role,permissions.evidenceUpload);
 const engagementId=uuid(input.engagementId,"engagementId"),workpaperId=uuid(input.workpaperId,"workpaperId");
 const procedureId=input.procedureId?uuid(input.procedureId,"procedureId"):null,pbcRequestId=input.pbcRequestId?uuid(input.pbcRequestId,"pbcRequestId"):null;
 const filename=text(input.filename,"filename",250),mimeType=text(input.mimeType,"mimeType",200),sizeBytes=positiveSize(input.sizeBytes);
 await requireTesting(tx,engagementId);
 const objectId=randomUUID();const storageKey=buildEvidenceStorageKey({organizationId:tx.context.organizationId,engagementId,objectId,filename});
 const ttlSeconds=600,expiresAt=new Date(Date.now()+ttlSeconds*1000);
 const row=(await tx.db.execute<{id:string}>(sql`insert into evidence_upload_intents(organization_id,engagement_id,workpaper_id,procedure_id,pbc_request_id,filename,mime_type,expected_size_bytes,storage_key,created_by,expires_at) values(${tx.context.organizationId}::uuid,${engagementId}::uuid,${workpaperId}::uuid,${procedureId}::uuid,${pbcRequestId}::uuid,${filename},${mimeType},${sizeBytes},${storageKey},${tx.principal.userId}::uuid,${expiresAt}) returning id`)).rows[0];
 if(!row)throw new Error("Unable to create evidence upload intent");
 const upload=await getObjectStore().createPutIntent({storageKey,contentType:mimeType,expiresInSeconds:ttlSeconds});
 await recordDomainChange(tx,{eventType:"engagement.evidence_upload_intent.created",aggregateType:"engagement",aggregateId:engagementId,action:"engagement.evidence_upload_intent.create",entityType:"evidence_upload_intent",entityId:row.id,payload:{workpaperId,procedureId,pbcRequestId},newValues:{filename,mimeType,sizeBytes,expiresAt:expiresAt.toISOString()}});
 return {intentId:row.id,uploadUrl:upload.uploadUrl,expiresAt:upload.expiresAt.toISOString(),requiredHeaders:upload.requiredHeaders};
}

export async function finalizeEvidenceUpload(tx:AuthorizedTenantTransaction,input:Record<string,unknown>){
 requirePermission(tx.membership.role,permissions.evidenceUpload);const intentId=uuid(input.intentId,"intentId");
 const result=await tx.db.execute<{id:string;engagement_id:string;workpaper_id:string;procedure_id:string|null;pbc_request_id:string|null;filename:string;mime_type:string;expected_size_bytes:string;storage_key:string;status:string;expires_at:Date}>(sql`select id,engagement_id,workpaper_id,procedure_id,pbc_request_id,filename,mime_type,expected_size_bytes::text,storage_key,status::text,expires_at from evidence_upload_intents where id=${intentId}::uuid and organization_id=${tx.context.organizationId}::uuid for update`);
 const intent=result.rows[0];if(!intent)throw new Error("Evidence upload intent not found");if(intent.status!=="PENDING")throw new Error(`Evidence upload intent is ${intent.status}`);if(new Date(intent.expires_at).getTime()<=Date.now()){await tx.db.execute(sql`update evidence_upload_intents set status='EXPIRED' where id=${intentId}::uuid`);throw new Error("Evidence upload intent has expired");}
 await requireTesting(tx,intent.engagement_id);
 const object=await getObjectStore().getObject(intent.storage_key);const expectedSize=Number(intent.expected_size_bytes);
 if(object.bytes.byteLength!==expectedSize)throw new Error(`Uploaded object size mismatch: expected ${expectedSize}, received ${object.bytes.byteLength}`);
 if(object.metadata.contentType&&intent.mime_type&&object.metadata.contentType!==intent.mime_type)throw new Error("Uploaded object content type does not match the authorized MIME type");
 const sha256=createHash("sha256").update(object.bytes).digest("hex");
 const evidence=await registerEvidence(tx,{engagementId:intent.engagement_id,workpaperId:intent.workpaper_id,procedureId:intent.procedure_id??undefined,pbcRequestId:intent.pbc_request_id??undefined,filename:intent.filename,mimeType:intent.mime_type,sizeBytes:expectedSize,storageKey:intent.storage_key,sha256,sourceDescription:text(input.sourceDescription,"sourceDescription",10_000),acquiredAt:typeof input.acquiredAt==="string"?input.acquiredAt:undefined,periodStart:typeof input.periodStart==="string"?input.periodStart:undefined,periodEnd:typeof input.periodEnd==="string"?input.periodEnd:undefined});
 await tx.db.execute(sql`update evidence_upload_intents set status='FINALIZED',finalized_at=now(),evidence_id=${evidence.id}::uuid where id=${intentId}::uuid`);
 await recordDomainChange(tx,{eventType:"engagement.evidence_upload_intent.finalized",aggregateType:"engagement",aggregateId:intent.engagement_id,action:"engagement.evidence_upload_intent.finalize",entityType:"evidence_upload_intent",entityId:intentId,payload:{evidenceId:evidence.id},newValues:{status:"FINALIZED",sha256}});
 return {evidenceId:evidence.id,sha256};
}

export async function createEvidenceDownload(tx:AuthorizedTenantTransaction,evidenceIdRaw:unknown){
 requirePermission(tx.membership.role,permissions.evidenceRead);const evidenceId=uuid(evidenceIdRaw,"evidenceId");
 const row=(await tx.db.execute<{storage_key:string;filename:string}>(sql`select storage_key,filename from evidence where id=${evidenceId}::uuid and organization_id=${tx.context.organizationId}::uuid and status='ACTIVE'`)).rows[0];if(!row)throw new Error("Evidence not found");
 const signed=await getObjectStore().createDownloadUrl({storageKey:row.storage_key,downloadFilename:row.filename});return {url:signed.url,expiresAt:signed.expiresAt.toISOString()};
}
