import "server-only";

import { sql } from "drizzle-orm";

import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions, requirePermission } from "@/auth/rbac";
import { recordDomainChange } from "@/domain/record-event";
import {
  validateAddSampleItemInput,
  validateCreateSampleInput,
  validateDefineProcedureExecutionInput,
  validateLinkWorkpaperRequirementInput,
  validateLinkWorkpaperSampleInput,
  validateReviewSampleInput,
  type AddSampleItemInput,
  type CreateSampleInput,
  type DefineProcedureExecutionInput,
  type LinkWorkpaperRequirementInput,
  type LinkWorkpaperSampleInput,
  type ReviewSampleInput,
} from "./execution-validation";

export class EngagementExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngagementExecutionError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requiredText(value: unknown, name: string, max = 20_000): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new EngagementExecutionError(`${name} is required`);
  const result = value.trim();
  if (result.length > max) throw new EngagementExecutionError(`${name} must not exceed ${max} characters`);
  return result;
}
function uuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new EngagementExecutionError(`${name} must be a UUID`);
  return value;
}

async function requireTesting(transaction: AuthorizedTenantTransaction, engagementId: string) {
  const result = await transaction.db.execute<{ status: string }>(sql`select status::text from engagements where id=${engagementId}::uuid and organization_id=${transaction.context.organizationId}::uuid`);
  const row = result.rows[0];
  if (!row) throw new EngagementExecutionError("Engagement not found");
  if (row.status !== "TESTING") throw new EngagementExecutionError(`Execution work is only allowed in TESTING; current status is ${row.status}`);
}

export async function createSample(transaction: AuthorizedTenantTransaction, input: CreateSampleInput) {
  requirePermission(transaction.membership.role, permissions.workpaperCreate);
  const v = validateCreateSampleInput(input); await requireTesting(transaction, v.engagementId);
  const result = await transaction.db.execute<{ id: string }>(sql`
    insert into samples (organization_id,engagement_id,requirement_id,scope_id,population_description,population_size,sampling_method,sample_size,selection_basis,created_by)
    values (${transaction.context.organizationId}::uuid,${v.engagementId}::uuid,${v.requirementId}::uuid,${v.scopeId}::uuid,${v.populationDescription},${v.populationSize},${v.samplingMethod},${v.sampleSize},${v.selectionBasis},${transaction.principal.userId}::uuid)
    returning id`);
  const row = result.rows[0]; if (!row) throw new EngagementExecutionError("Sample write failed");
  await recordDomainChange(transaction,{eventType:"engagement.sample.created",aggregateType:"engagement",aggregateId:v.engagementId,action:"engagement.sample.create",entityType:"sample",entityId:row.id,payload:{requirementId:v.requirementId,scopeId:v.scopeId},newValues:{samplingMethod:v.samplingMethod,sampleSize:v.sampleSize,populationSize:v.populationSize}});
  return row;
}

export async function addSampleItem(transaction: AuthorizedTenantTransaction, input: AddSampleItemInput) {
  requirePermission(transaction.membership.role, permissions.workpaperCreate);
  const v = validateAddSampleItemInput(input);
  const parent = await transaction.db.execute<{ engagement_id: string }>(sql`select engagement_id from samples where id=${v.sampleId}::uuid and organization_id=${transaction.context.organizationId}::uuid`);
  const engagementId = parent.rows[0]?.engagement_id; if (!engagementId) throw new EngagementExecutionError("Sample not found"); await requireTesting(transaction, engagementId);
  const result = await transaction.db.execute<{ id: string }>(sql`insert into sample_items (organization_id,engagement_id,sample_id,item_key,item_snapshot,selection_reason,selected_by) values (${transaction.context.organizationId}::uuid,${engagementId}::uuid,${v.sampleId}::uuid,${v.itemKey},${JSON.stringify(v.itemSnapshot)}::jsonb,${v.selectionReason},${transaction.principal.userId}::uuid) returning id`);
  const row=result.rows[0]; if(!row) throw new EngagementExecutionError("Sample item write failed");
  await recordDomainChange(transaction,{eventType:"engagement.sample_item.added",aggregateType:"engagement",aggregateId:engagementId,action:"engagement.sample_item.add",entityType:"sample_item",entityId:row.id,payload:{sampleId:v.sampleId,itemKey:v.itemKey},newValues:{selectionReason:v.selectionReason}}); return row;
}

export async function reviewSample(transaction: AuthorizedTenantTransaction, input: ReviewSampleInput) {
  requirePermission(transaction.membership.role, permissions.workpaperReview);
  const v=validateReviewSampleInput(input);
  const parent=await transaction.db.execute<{engagement_id:string;created_by:string;review_status:string}>(sql`select engagement_id,created_by,review_status::text from samples where id=${v.sampleId}::uuid and organization_id=${transaction.context.organizationId}::uuid`);
  const sample=parent.rows[0]; if(!sample) throw new EngagementExecutionError("Sample not found"); await requireTesting(transaction,sample.engagement_id);
  if(sample.created_by===transaction.principal.userId) throw new EngagementExecutionError("Sample creator cannot independently review the same sample");
  if(sample.review_status!=="DRAFT") throw new EngagementExecutionError("Only DRAFT samples may be reviewed");
  await transaction.db.execute(sql`update samples set review_status=${v.decision}::sample_review_status,reviewed_by=${transaction.principal.userId}::uuid,reviewed_at=now(),review_rationale=${v.rationale} where id=${v.sampleId}::uuid`);
  await recordDomainChange(transaction,{eventType:"engagement.sample.reviewed",aggregateType:"engagement",aggregateId:sample.engagement_id,action:"engagement.sample.review",entityType:"sample",entityId:v.sampleId,payload:{decision:v.decision},newValues:{reviewStatus:v.decision,reviewRationale:v.rationale}}); return {id:v.sampleId,decision:v.decision};
}

export async function createWorkpaper(transaction: AuthorizedTenantTransaction, input: Record<string, unknown>) {
  requirePermission(transaction.membership.role, permissions.workpaperCreate);
  const engagementId=uuid(input.engagementId,"engagementId"); await requireTesting(transaction,engagementId); const title=requiredText(input.title,"title",500);
  const controlId=input.controlId == null || input.controlId === "" ? null : uuid(input.controlId,"controlId");
  const result=await transaction.db.execute<{id:string}>(sql`insert into workpapers (organization_id,engagement_id,control_id,title,prepared_by) values (${transaction.context.organizationId}::uuid,${engagementId}::uuid,${controlId}::uuid,${title},${transaction.principal.userId}::uuid) returning id`);
  const row=result.rows[0]; if(!row) throw new EngagementExecutionError("Workpaper write failed");
  await recordDomainChange(transaction,{eventType:"engagement.workpaper.created",aggregateType:"engagement",aggregateId:engagementId,action:"engagement.workpaper.create",entityType:"workpaper",entityId:row.id,payload:{controlId},newValues:{title}}); return row;
}

export async function linkWorkpaperRequirement(transaction: AuthorizedTenantTransaction,input:LinkWorkpaperRequirementInput){requirePermission(transaction.membership.role,permissions.workpaperUpdate);const v=validateLinkWorkpaperRequirementInput(input);const wp=await transaction.db.execute<{engagement_id:string}>(sql`select engagement_id from workpapers where id=${v.workpaperId}::uuid and organization_id=${transaction.context.organizationId}::uuid`);const engagementId=wp.rows[0]?.engagement_id;if(!engagementId)throw new EngagementExecutionError("Workpaper not found");await requireTesting(transaction,engagementId);const result=await transaction.db.execute<{id:string}>(sql`insert into workpaper_requirement_links (organization_id,engagement_id,workpaper_id,applicability_id,requirement_id,control_id,linked_by) values (${transaction.context.organizationId}::uuid,${engagementId}::uuid,${v.workpaperId}::uuid,${v.applicabilityId}::uuid,${v.requirementId}::uuid,${v.controlId}::uuid,${transaction.principal.userId}::uuid) returning id`);const row=result.rows[0];if(!row)throw new EngagementExecutionError("Requirement link failed");return row;}

export async function linkWorkpaperSample(transaction:AuthorizedTenantTransaction,input:LinkWorkpaperSampleInput){requirePermission(transaction.membership.role,permissions.workpaperUpdate);const v=validateLinkWorkpaperSampleInput(input);await transaction.db.execute(sql`insert into workpaper_sample_links(workpaper_id,sample_id,linked_by) values (${v.workpaperId}::uuid,${v.sampleId}::uuid,${transaction.principal.userId}::uuid)`);return v;}

export async function createProcedure(transaction:AuthorizedTenantTransaction,input:Record<string,unknown>){requirePermission(transaction.membership.role,permissions.workpaperUpdate);const workpaperId=uuid(input.workpaperId,"workpaperId");const wp=await transaction.db.execute<{engagement_id:string}>(sql`select engagement_id from workpapers where id=${workpaperId}::uuid and organization_id=${transaction.context.organizationId}::uuid`);const engagementId=wp.rows[0]?.engagement_id;if(!engagementId)throw new EngagementExecutionError("Workpaper not found");await requireTesting(transaction,engagementId);const name=requiredText(input.name,"name",500),description=requiredText(input.description,"description"),procedureType=requiredText(input.procedureType,"procedureType",100);const sequence=Number(input.sequence);if(!Number.isSafeInteger(sequence)||sequence<1)throw new EngagementExecutionError("sequence must be a positive integer");const expectedResult=typeof input.expectedResult==="string"&&input.expectedResult.trim()?input.expectedResult.trim():null;const result=await transaction.db.execute<{id:string}>(sql`insert into procedures(workpaper_id,name,description,procedure_type,sequence,expected_result) values (${workpaperId}::uuid,${name},${description},${procedureType},${sequence},${expectedResult}) returning id`);const row=result.rows[0];if(!row)throw new EngagementExecutionError("Procedure write failed");return row;}

export async function defineProcedureExecution(transaction:AuthorizedTenantTransaction,input:DefineProcedureExecutionInput){requirePermission(transaction.membership.role,permissions.workpaperUpdate);const v=validateDefineProcedureExecutionInput(input);const lineage=await transaction.db.execute<{engagement_id:string}>(sql`select w.engagement_id from procedures p join workpapers w on w.id=p.workpaper_id where p.id=${v.procedureId}::uuid and w.organization_id=${transaction.context.organizationId}::uuid`);const engagementId=lineage.rows[0]?.engagement_id;if(!engagementId)throw new EngagementExecutionError("Procedure not found");await requireTesting(transaction,engagementId);await transaction.db.execute(sql`insert into procedure_execution_requirements(procedure_id,organization_id,engagement_id,requirement_id,test_objective,expected_evidence,test_method,created_by) values (${v.procedureId}::uuid,${transaction.context.organizationId}::uuid,${engagementId}::uuid,${v.requirementId}::uuid,${v.testObjective},${v.expectedEvidence},${v.testMethod},${transaction.principal.userId}::uuid)`);return v;}

export async function createPbcRequest(transaction:AuthorizedTenantTransaction,input:Record<string,unknown>){requirePermission(transaction.membership.role,permissions.evidenceUpload);const engagementId=uuid(input.engagementId,"engagementId");await requireTesting(transaction,engagementId);const workpaperId=input.workpaperId?uuid(input.workpaperId,"workpaperId"):null;const procedureId=input.procedureId?uuid(input.procedureId,"procedureId"):null;const requirementId=input.requirementId?uuid(input.requirementId,"requirementId"):null;const title=requiredText(input.title,"title",500);const description=typeof input.description==="string"?input.description.trim()||null:null;const expectedEvidence=requiredText(input.expectedEvidence,"expectedEvidence");const dueAt=typeof input.dueAt==="string"&&input.dueAt?new Date(input.dueAt):null;if(dueAt&&Number.isNaN(dueAt.getTime()))throw new EngagementExecutionError("dueAt must be a valid date");const result=await transaction.db.execute<{id:string}>(sql`insert into pbc_requests(engagement_id,workpaper_id,procedure_id,requirement_id,requested_by,title,description,expected_evidence,due_at) values (${engagementId}::uuid,${workpaperId}::uuid,${procedureId}::uuid,${requirementId}::uuid,${transaction.principal.userId}::uuid,${title},${description},${expectedEvidence},${dueAt}) returning id`);const row=result.rows[0];if(!row)throw new EngagementExecutionError("PBC request write failed");await recordDomainChange(transaction,{eventType:"engagement.pbc.created",aggregateType:"engagement",aggregateId:engagementId,action:"engagement.pbc.create",entityType:"pbc_request",entityId:row.id,payload:{workpaperId,procedureId,requirementId},newValues:{title,expectedEvidence,dueAt:dueAt?.toISOString()??null}});return row;}
