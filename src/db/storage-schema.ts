import { bigint, index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { engagements, evidence, organizations, pbcRequests, procedures, users, workpapers } from "./schema";

const timestamptz=(name:string)=>timestamp(name,{withTimezone:true});
export const evidenceUploadIntentStatus=pgEnum("evidence_upload_intent_status",["PENDING","FINALIZED","CANCELLED","EXPIRED"]);
export const evidenceUploadIntents=pgTable("evidence_upload_intents",{
 id:uuid("id").defaultRandom().primaryKey(),
 organizationId:uuid("organization_id").notNull().references(()=>organizations.id),
 engagementId:uuid("engagement_id").notNull().references(()=>engagements.id),
 workpaperId:uuid("workpaper_id").notNull().references(()=>workpapers.id),
 procedureId:uuid("procedure_id").references(()=>procedures.id),
 pbcRequestId:uuid("pbc_request_id").references(()=>pbcRequests.id),
 filename:text("filename").notNull(), mimeType:text("mime_type").notNull(),
 expectedSizeBytes:bigint("expected_size_bytes",{mode:"number"}).notNull(), storageKey:text("storage_key").notNull(),
 status:evidenceUploadIntentStatus("status").notNull().default("PENDING"),
 createdBy:uuid("created_by").notNull().references(()=>users.id), createdAt:timestamptz("created_at").notNull().defaultNow(), expiresAt:timestamptz("expires_at").notNull(),
 finalizedAt:timestamptz("finalized_at"), evidenceId:uuid("evidence_id").references(()=>evidence.id),
},t=>[
 unique("evidence_upload_intents_organization_id_storage_key_key").on(t.organizationId,t.storageKey),
 index("evidence_upload_intents_org_engagement_status_idx").on(t.organizationId,t.engagementId,t.status,t.expiresAt),
]);
