import { bigint, boolean, char, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid, integer } from "drizzle-orm/pg-core";

import { clients, organizations, users } from "./schema";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Typed mirror for privacy operations tables introduced by migration 0013.
 * SQL migrations remain authoritative for RLS, constraints, and tenant integrity.
 */
export const privacyRecordState = pgEnum("privacy_record_state", [
  "DRAFT",
  "ACTIVE",
  "UNDER_REVIEW",
  "CLOSED",
  "ARCHIVED",
]);

export const dpiaDecision = pgEnum("dpia_decision", [
  "NOT_REQUIRED",
  "REQUIRED",
  "IN_PROGRESS",
  "APPROVED",
  "REJECTED",
]);

export const processorStatus = pgEnum("processor_status", [
  "PROSPECTIVE",
  "ACTIVE",
  "SUSPENDED",
  "TERMINATED",
]);

export const transferMechanism = pgEnum("transfer_mechanism", [
  "ADEQUACY",
  "SCC",
  "BCR",
  "DEROGATION",
  "OTHER",
]);

export const dsrStatus = pgEnum("dsr_status", [
  "RECEIVED",
  "IDENTITY_VERIFICATION",
  "IN_PROGRESS",
  "ON_HOLD",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
]);

export const breachStatus = pgEnum("breach_status", [
  "DETECTED",
  "TRIAGE",
  "INVESTIGATING",
  "CONTAINED",
  "NOTIFICATION_ASSESSMENT",
  "NOTIFIED",
  "CLOSED",
]);

export const processingActivities = pgTable("processing_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clientId: uuid("client_id").references(() => clients.id),
  name: text("name").notNull(),
  purpose: text("purpose").notNull(),
  controllerProcessorRole: text("controller_processor_role").notNull(),
  dataSubjectCategories: jsonb("data_subject_categories").$type<string[]>().notNull().default([]),
  personalDataCategories: jsonb("personal_data_categories").$type<string[]>().notNull().default([]),
  specialCategoryData: boolean("special_category_data").notNull().default(false),
  lawfulBasis: text("lawful_basis"),
  recipients: jsonb("recipients").$type<string[]>().notNull().default([]),
  retentionSummary: text("retention_summary"),
  securityMeasuresSummary: text("security_measures_summary"),
  state: privacyRecordState("state").notNull().default("DRAFT"),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const dpiaAssessments = pgTable("dpia_assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  processingActivityId: uuid("processing_activity_id").notNull().references(() => processingActivities.id),
  version: integer("version").notNull(),
  screeningRationale: text("screening_rationale").notNull(),
  decision: dpiaDecision("decision").notNull(),
  riskSummary: text("risk_summary"),
  mitigationSummary: text("mitigation_summary"),
  residualRisk: text("residual_risk"),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamptz("approved_at"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const processors = pgTable("processors", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  serviceDescription: text("service_description").notNull(),
  status: processorStatus("status").notNull().default("PROSPECTIVE"),
  country: text("country"),
  contractReference: text("contract_reference"),
  dpaReference: text("dpa_reference"),
  securityReviewStatus: text("security_review_status"),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const internationalTransfers = pgTable("international_transfers", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  processingActivityId: uuid("processing_activity_id").notNull().references(() => processingActivities.id),
  processorId: uuid("processor_id").references(() => processors.id),
  destinationCountry: text("destination_country").notNull(),
  mechanism: transferMechanism("mechanism").notNull(),
  mechanismReference: text("mechanism_reference"),
  transferRiskAssessmentReference: text("transfer_risk_assessment_reference"),
  supplementaryMeasures: text("supplementary_measures"),
  state: privacyRecordState("state").notNull().default("DRAFT"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const dataSubjectRequests = pgTable("data_subject_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  requestType: text("request_type").notNull(),
  subjectReferenceHash: char("subject_reference_hash", { length: 64 }).notNull(),
  receivedAt: timestamptz("received_at").notNull(),
  dueAt: timestamptz("due_at"),
  status: dsrStatus("status").notNull().default("RECEIVED"),
  identityVerifiedAt: timestamptz("identity_verified_at"),
  assignedTo: uuid("assigned_to").references(() => users.id),
  outcome: text("outcome"),
  closedAt: timestamptz("closed_at"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const privacyBreaches = pgTable("privacy_breaches", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  title: text("title").notNull(),
  detectedAt: timestamptz("detected_at").notNull(),
  occurredAt: timestamptz("occurred_at"),
  status: breachStatus("status").notNull().default("DETECTED"),
  description: text("description").notNull(),
  dataCategories: jsonb("data_categories").$type<string[]>().notNull().default([]),
  affectedSubjectsEstimate: bigint("affected_subjects_estimate", { mode: "number" }),
  severity: text("severity"),
  containmentSummary: text("containment_summary"),
  notificationRequired: boolean("notification_required"),
  notificationRationale: text("notification_rationale"),
  authorityNotifiedAt: timestamptz("authority_notified_at"),
  subjectsNotifiedAt: timestamptz("subjects_notified_at"),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});
