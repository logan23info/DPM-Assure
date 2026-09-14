import { sql } from "drizzle-orm";
import {
  AnyPgColumn,
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Typed application mirror of the frozen DPM-Assure PostgreSQL schema.
 *
 * IMPORTANT: db/migrations/*.sql remains authoritative for RLS, triggers,
 * append-only enforcement, tenant integrity, and freeze behavior. Do not use
 * Drizzle generation to rewrite the foundation migrations.
 */

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const recordStatus = pgEnum("record_status", [
  "ACTIVE",
  "INACTIVE",
  "ARCHIVED",
]);

export const membershipRole = pgEnum("membership_role", [
  "SUPER_ADMIN",
  "ORG_ADMIN",
  "AUDIT_MANAGER",
  "LEAD_AUDITOR",
  "AUDITOR",
  "REVIEWER",
  "CLIENT",
  "VIEWER",
]);

export const engagementStatus = pgEnum("engagement_status", [
  "PLANNING",
  "TESTING",
  "REVIEW",
  "CLOSED",
]);

export const reviewStatus = pgEnum("review_status", [
  "PENDING",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
]);

export const aiReviewStatus = pgEnum("ai_review_status", [
  "GENERATED",
  "AI_REVIEW_PENDING",
  "HUMAN_REVIEW",
  "APPROVED",
  "REJECTED",
  "PUBLISHED",
]);

export const gateResult = pgEnum("gate_result", [
  "PASS",
  "FAIL",
  "INSUFFICIENT_EVIDENCE",
]);

export const testResultStatus = pgEnum("test_result_status", [
  "PASS",
  "FAIL",
  "INSUFFICIENT_EVIDENCE",
  "NOT_APPLICABLE",
]);

export const workflowStatus = pgEnum("workflow_status", [
  "OPEN",
  "IN_PROGRESS",
  "BLOCKED",
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
]);

// Identity and tenancy

export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: recordStatus("status").notNull().default("ACTIVE"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  status: recordStatus("status").notNull().default("ACTIVE"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: membershipRole("role").notNull(),
    status: recordStatus("status").notNull().default("ACTIVE"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("memberships_organization_id_user_id_key").on(
      table.organizationId,
      table.userId,
    ),
    index("memberships_user_idx").on(table.userId),
  ],
);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    name: text("name").notNull(),
    status: recordStatus("status").notNull().default("ACTIVE"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("clients_organization_id_name_key").on(
      table.organizationId,
      table.name,
    ),
    unique("clients_id_organization_id_key").on(table.id, table.organizationId),
  ],
);

// Governance

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: text("source_id").notNull().unique(),
    authority: text("authority").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    edition: text("edition"),
    status: recordStatus("status").notNull().default("ACTIVE"),
    jurisdiction: text("jurisdiction"),
    sourceUrl: text("source_url").notNull(),
    publishedAt: timestamptz("published_at"),
    effectiveAt: timestamptz("effective_at"),
    retiredAt: timestamptz("retired_at"),
    lastValidatedAt: timestamptz("last_validated_at"),
    validatedBy: uuid("validated_by").references(() => users.id),
    nextReviewAt: timestamptz("next_review_at"),
    licenseNotes: text("license_notes"),
    intendedUse: text("intended_use"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "sources_retired_after_effective",
      sql`${table.retiredAt} is null or ${table.effectiveAt} is null or ${table.retiredAt} >= ${table.effectiveAt}`,
    ),
  ],
);

export const frameworks = pgTable("frameworks", {
  id: uuid("id").defaultRandom().primaryKey(),
  frameworkKey: text("framework_key").notNull().unique(),
  name: text("name").notNull(),
  authority: text("authority").notNull(),
  status: recordStatus("status").notNull().default("ACTIVE"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const frameworkVersions = pgTable(
  "framework_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    frameworkId: uuid("framework_id")
      .notNull()
      .references(() => frameworks.id),
    version: text("version").notNull(),
    status: recordStatus("status").notNull().default("ACTIVE"),
    publishedAt: timestamptz("published_at"),
    effectiveAt: timestamptz("effective_at"),
    retiredAt: timestamptz("retired_at"),
    sourceId: uuid("source_id").references(() => sources.id),
    sourceUrl: text("source_url"),
    validatedAt: timestamptz("validated_at"),
    validatedBy: uuid("validated_by").references(() => users.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("framework_versions_framework_id_version_key").on(
      table.frameworkId,
      table.version,
    ),
  ],
);

export const requirements = pgTable(
  "requirements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    frameworkVersionId: uuid("framework_version_id")
      .notNull()
      .references(() => frameworkVersions.id),
    requirementKey: text("requirement_key").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    classification: text("classification").notNull(),
    sectionReference: text("section_reference"),
    applicability: text("applicability"),
    testProcedure: text("test_procedure"),
    expectedEvidence: text("expected_evidence"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("requirements_framework_version_id_requirement_key_key").on(
      table.frameworkVersionId,
      table.requirementKey,
    ),
  ],
);

export const controls = pgTable(
  "controls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").references(() => organizations.id),
    controlKey: text("control_key").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    controlType: text("control_type").notNull(),
    objective: text("objective"),
    testProcedure: text("test_procedure"),
    expectedEvidence: text("expected_evidence"),
    status: recordStatus("status").notNull().default("ACTIVE"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("controls_global_key_uq")
      .on(table.controlKey)
      .where(sql`${table.organizationId} is null`),
    uniqueIndex("controls_org_key_uq")
      .on(table.organizationId, table.controlKey)
      .where(sql`${table.organizationId} is not null`),
  ],
);

export const controlRequirementMappings = pgTable(
  "control_requirement_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    controlId: uuid("control_id")
      .notNull()
      .references(() => controls.id),
    requirementId: uuid("requirement_id")
      .notNull()
      .references(() => requirements.id),
    relationship: text("relationship").notNull(),
    coverage: text("coverage").notNull(),
    rationale: text("rationale").notNull(),
    sourceReference: text("source_reference"),
    reviewerId: uuid("reviewer_id").references(() => users.id),
    reviewedAt: timestamptz("reviewed_at"),
    effectiveAt: timestamptz("effective_at"),
    retiredAt: timestamptz("retired_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("control_requirement_mappings_control_requirement_effective_key").on(
      table.controlId,
      table.requirementId,
      table.effectiveAt,
    ),
  ],
);

// Assurance

export const engagements = pgTable(
  "engagements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id),
    name: text("name").notNull(),
    description: text("description"),
    status: engagementStatus("status").notNull().default("PLANNING"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    leadAuditorId: uuid("lead_auditor_id").references(() => users.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    frozenAt: timestamptz("frozen_at"),
  },
  (table) => [
    check(
      "engagements_end_after_start",
      sql`${table.endDate} is null or ${table.startDate} is null or ${table.endDate} >= ${table.startDate}`,
    ),
    index("engagements_org_status_idx").on(table.organizationId, table.status),
    unique("engagements_id_organization_id_key").on(table.id, table.organizationId),
  ],
);

export const engagementFrameworks = pgTable(
  "engagement_frameworks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    frameworkVersionId: uuid("framework_version_id")
      .notNull()
      .references(() => frameworkVersions.id),
    applicabilityStatus: text("applicability_status").notNull(),
    rationale: text("rationale"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamptz("reviewed_at"),
  },
  (table) => [
    unique("engagement_frameworks_engagement_framework_key").on(
      table.engagementId,
      table.frameworkVersionId,
    ),
  ],
);

export const scopes = pgTable("scopes", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagements.id),
  name: text("name").notNull(),
  description: text("description"),
  inScope: boolean("in_scope").notNull().default(true),
  owner: text("owner"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const independenceChecks = pgTable("independence_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagements.id),
  subjectUserId: uuid("subject_user_id")
    .notNull()
    .references(() => users.id),
  result: text("result").notNull(),
  conflictDetails: text("conflict_details"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolvedAt: timestamptz("resolved_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const riskAssessments = pgTable("risk_assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagements.id),
  methodVersion: text("method_version").notNull(),
  inherentScore: numeric("inherent_score", { precision: 10, scale: 2 }),
  controlScore: numeric("control_score", { precision: 10, scale: 2 }),
  residualScore: numeric("residual_score", { precision: 10, scale: 2 }),
  rationale: text("rationale").notNull(),
  assessedBy: uuid("assessed_by")
    .notNull()
    .references(() => users.id),
  assessedAt: timestamptz("assessed_at").notNull().defaultNow(),
});

export const auditPlans = pgTable(
  "audit_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    version: integer("version").notNull(),
    status: reviewStatus("status").notNull().default("PENDING"),
    objectives: text("objectives").notNull(),
    scopeSummary: text("scope_summary").notNull(),
    samplingApproach: text("sampling_approach"),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamptz("approved_at"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    check("audit_plans_version_positive", sql`${table.version} > 0`),
    unique("audit_plans_engagement_id_version_key").on(
      table.engagementId,
      table.version,
    ),
  ],
);

// Execution

export const workpapers = pgTable(
  "workpapers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    controlId: uuid("control_id").references(() => controls.id),
    title: text("title").notNull(),
    status: workflowStatus("status").notNull().default("OPEN"),
    preparedBy: uuid("prepared_by")
      .notNull()
      .references(() => users.id),
    reviewerId: uuid("reviewer_id").references(() => users.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
    frozenAt: timestamptz("frozen_at"),
  },
  (table) => [
    index("workpapers_org_engagement_idx").on(
      table.organizationId,
      table.engagementId,
    ),
    unique("workpapers_id_organization_id_key").on(table.id, table.organizationId),
  ],
);

export const workpaperVersions = pgTable(
  "workpaper_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workpaperId: uuid("workpaper_id")
      .notNull()
      .references(() => workpapers.id),
    versionNumber: integer("version_number").notNull(),
    content: jsonb("content").notNull(),
    changedBy: uuid("changed_by")
      .notNull()
      .references(() => users.id),
    changedAt: timestamptz("changed_at").notNull().defaultNow(),
    changeReason: text("change_reason").notNull(),
  },
  (table) => [
    check("workpaper_versions_version_positive", sql`${table.versionNumber} > 0`),
    unique("workpaper_versions_workpaper_id_version_number_key").on(
      table.workpaperId,
      table.versionNumber,
    ),
  ],
);

export const procedures = pgTable(
  "procedures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workpaperId: uuid("workpaper_id")
      .notNull()
      .references(() => workpapers.id),
    name: text("name").notNull(),
    description: text("description").notNull(),
    procedureType: text("procedure_type").notNull(),
    sequence: integer("sequence").notNull(),
    expectedResult: text("expected_result"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("procedures_sequence_positive", sql`${table.sequence} > 0`),
    unique("procedures_workpaper_id_sequence_key").on(
      table.workpaperId,
      table.sequence,
    ),
  ],
);

export const pbcRequests = pgTable("pbc_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagements.id),
  workpaperId: uuid("workpaper_id").references(() => workpapers.id),
  requestedBy: uuid("requested_by")
    .notNull()
    .references(() => users.id),
  assignedTo: uuid("assigned_to").references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  status: workflowStatus("status").notNull().default("OPEN"),
  dueAt: timestamptz("due_at"),
  fulfilledAt: timestamptz("fulfilled_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const evidence = pgTable(
  "evidence",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    workpaperId: uuid("workpaper_id")
      .notNull()
      .references(() => workpapers.id),
    procedureId: uuid("procedure_id").references(() => procedures.id),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    storageKey: text("storage_key").notNull(),
    sha256: char("sha256", { length: 64 }).notNull(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id),
    uploadedAt: timestamptz("uploaded_at").notNull().defaultNow(),
    retentionUntil: timestamptz("retention_until"),
    sourceDescription: text("source_description"),
    chainOfCustodyRef: text("chain_of_custody_ref"),
    status: recordStatus("status").notNull().default("ACTIVE"),
  },
  (table) => [
    check("evidence_size_nonnegative", sql`${table.sizeBytes} >= 0`),
    check("evidence_sha256_format", sql`${table.sha256} ~ '^[0-9a-fA-F]{64}$'`),
    unique("evidence_organization_id_storage_key_key").on(
      table.organizationId,
      table.storageKey,
    ),
    unique("evidence_id_organization_id_key").on(table.id, table.organizationId),
    index("evidence_workpaper_idx").on(table.workpaperId),
  ],
);

export const evidenceGateResults = pgTable("evidence_gate_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  evidenceId: uuid("evidence_id")
    .notNull()
    .references(() => evidence.id),
  gateVersion: text("gate_version").notNull(),
  identityStatus: gateResult("identity_status").notNull(),
  provenanceStatus: gateResult("provenance_status").notNull(),
  integrityStatus: gateResult("integrity_status").notNull(),
  authorizationStatus: gateResult("authorization_status").notNull(),
  applicabilityStatus: gateResult("applicability_status").notNull(),
  temporalStatus: gateResult("temporal_status").notNull(),
  completenessStatus: gateResult("completeness_status").notNull(),
  overallResult: gateResult("overall_result").notNull(),
  evaluatedBy: uuid("evaluated_by")
    .notNull()
    .references(() => users.id),
  evaluatedAt: timestamptz("evaluated_at").notNull().defaultNow(),
  rationale: text("rationale").notNull(),
});

export const testResults = pgTable("test_results", {
  id: uuid("id").defaultRandom().primaryKey(),
  workpaperId: uuid("workpaper_id")
    .notNull()
    .references(() => workpapers.id),
  procedureId: uuid("procedure_id")
    .notNull()
    .references(() => procedures.id),
  evidenceGateResultId: uuid("evidence_gate_result_id").references(
    () => evidenceGateResults.id,
  ),
  result: testResultStatus("result").notNull(),
  exceptionSummary: text("exception_summary"),
  conclusion: text("conclusion"),
  testedBy: uuid("tested_by")
    .notNull()
    .references(() => users.id),
  testedAt: timestamptz("tested_at").notNull().defaultNow(),
});

export const samples = pgTable(
  "samples",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    workpaperId: uuid("workpaper_id").references(() => workpapers.id),
    populationDescription: text("population_description").notNull(),
    populationSize: bigint("population_size", { mode: "number" }),
    samplingMethod: text("sampling_method").notNull(),
    sampleSize: bigint("sample_size", { mode: "number" }),
    selectionBasis: text("selection_basis").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "samples_population_size_nonnegative",
      sql`${table.populationSize} is null or ${table.populationSize} >= 0`,
    ),
    check(
      "samples_sample_size_nonnegative",
      sql`${table.sampleSize} is null or ${table.sampleSize} >= 0`,
    ),
  ],
);

// Outcomes

export const exceptions = pgTable(
  "exceptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    workpaperId: uuid("workpaper_id")
      .notNull()
      .references(() => workpapers.id),
    testResultId: uuid("test_result_id")
      .notNull()
      .references(() => testResults.id),
    description: text("description").notNull(),
    severity: text("severity").notNull(),
    status: workflowStatus("status").notNull().default("OPEN"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("exceptions_id_organization_id_key").on(table.id, table.organizationId),
  ],
);

export const findings = pgTable(
  "findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    exceptionId: uuid("exception_id").references(() => exceptions.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    findingType: text("finding_type").notNull(),
    status: workflowStatus("status").notNull().default("OPEN"),
    riskId: uuid("risk_id").references((): AnyPgColumn => risks.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("findings_id_organization_id_key").on(table.id, table.organizationId),
  ],
);

export const risks = pgTable(
  "risks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    findingId: uuid("finding_id")
      .notNull()
      .unique()
      .references((): AnyPgColumn => findings.id),
    likelihood: numeric("likelihood", { precision: 10, scale: 2 }).notNull(),
    impact: numeric("impact", { precision: 10, scale: 2 }).notNull(),
    score: numeric("score", { precision: 10, scale: 2 }).notNull(),
    methodVersion: text("method_version").notNull(),
    rationale: text("rationale").notNull(),
    assessedBy: uuid("assessed_by")
      .notNull()
      .references(() => users.id),
    assessedAt: timestamptz("assessed_at").notNull().defaultNow(),
  },
  (table) => [unique("risks_id_organization_id_key").on(table.id, table.organizationId)],
);

export const remediations = pgTable("remediations", {
  id: uuid("id").defaultRandom().primaryKey(),
  findingId: uuid("finding_id")
    .notNull()
    .references(() => findings.id),
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  plan: text("plan").notNull(),
  status: workflowStatus("status").notNull().default("OPEN"),
  targetDate: date("target_date"),
  completedAt: timestamptz("completed_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const riskAcceptances = pgTable(
  "risk_acceptances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    findingId: uuid("finding_id")
      .notNull()
      .references(() => findings.id),
    acceptedBy: uuid("accepted_by")
      .notNull()
      .references(() => users.id),
    rationale: text("rationale").notNull(),
    acceptedAt: timestamptz("accepted_at").notNull().defaultNow(),
    expiresAt: timestamptz("expires_at").notNull(),
    reviewDueAt: timestamptz("review_due_at").notNull(),
    status: workflowStatus("status").notNull().default("OPEN"),
  },
  (table) => [
    check("risk_acceptances_expiry_after_accept", sql`${table.expiresAt} > ${table.acceptedAt}`),
    check("risk_acceptances_review_before_expiry", sql`${table.reviewDueAt} <= ${table.expiresAt}`),
  ],
);

export const retests = pgTable("retests", {
  id: uuid("id").defaultRandom().primaryKey(),
  findingId: uuid("finding_id")
    .notNull()
    .references(() => findings.id),
  remediationId: uuid("remediation_id").references(() => remediations.id),
  result: testResultStatus("result").notNull(),
  evidenceId: uuid("evidence_id").references(() => evidence.id),
  testedBy: uuid("tested_by")
    .notNull()
    .references(() => users.id),
  testedAt: timestamptz("tested_at").notNull().defaultNow(),
  conclusion: text("conclusion").notNull(),
});

// Review and closure

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagements.id),
  workpaperId: uuid("workpaper_id").references(() => workpapers.id),
  reviewerId: uuid("reviewer_id")
    .notNull()
    .references(() => users.id),
  status: reviewStatus("status").notNull().default("PENDING"),
  comments: text("comments"),
  reviewedAt: timestamptz("reviewed_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const signoffs = pgTable("signoffs", {
  id: uuid("id").defaultRandom().primaryKey(),
  engagementId: uuid("engagement_id")
    .notNull()
    .references(() => engagements.id),
  reviewedBy: uuid("reviewed_by")
    .notNull()
    .references(() => users.id),
  role: membershipRole("role").notNull(),
  status: reviewStatus("status").notNull().default("PENDING"),
  statement: text("statement").notNull(),
  signedAt: timestamptz("signed_at"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    version: integer("version").notNull(),
    status: reviewStatus("status").notNull().default("PENDING"),
    reportType: text("report_type").notNull(),
    content: jsonb("content").notNull(),
    generatedBy: uuid("generated_by")
      .notNull()
      .references(() => users.id),
    approvedBy: uuid("approved_by").references(() => users.id),
    approvedAt: timestamptz("approved_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("reports_version_positive", sql`${table.version} > 0`),
    unique("reports_engagement_id_version_key").on(
      table.engagementId,
      table.version,
    ),
  ],
);

export const auditFreezes = pgTable(
  "audit_freezes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    version: integer("version").notNull(),
    frozenBy: uuid("frozen_by")
      .notNull()
      .references(() => users.id),
    frozenAt: timestamptz("frozen_at").notNull().defaultNow(),
    freezeReason: text("freeze_reason").notNull(),
    snapshotHash: char("snapshot_hash", { length: 64 }).notNull(),
  },
  (table) => [
    check("audit_freezes_version_positive", sql`${table.version} > 0`),
    check(
      "audit_freezes_snapshot_hash_format",
      sql`${table.snapshotHash} ~ '^[0-9a-fA-F]{64}$'`,
    ),
    unique("audit_freezes_engagement_id_version_key").on(
      table.engagementId,
      table.version,
    ),
  ],
);

// Cross-cutting assurance history and provenance

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    timestamp: timestamptz("timestamp").notNull().defaultNow(),
    ipAddress: inet("ip_address"),
    userAgent: text("user_agent"),
    requestId: uuid("request_id").notNull(),
    oldValues: jsonb("old_values"),
    newValues: jsonb("new_values"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [index("audit_logs_org_time_idx").on(table.organizationId, table.timestamp)],
);

export const domainEvents = pgTable(
  "domain_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    payload: jsonb("payload").notNull(),
    occurredAt: timestamptz("occurred_at").notNull().defaultNow(),
    requestId: uuid("request_id").notNull(),
  },
  (table) => [
    index("domain_events_org_time_idx").on(
      table.organizationId,
      table.occurredAt,
    ),
  ],
);

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  recipientUserId: uuid("recipient_user_id")
    .notNull()
    .references(() => users.id),
  eventType: text("event_type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("UNREAD"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  readAt: timestamptz("read_at"),
});

export const aiGenerations = pgTable(
  "ai_generations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    engagementId: uuid("engagement_id").references(() => engagements.id),
    sourceType: text("source_type").notNull(),
    sourceReference: text("source_reference"),
    promptVersion: text("prompt_version").notNull(),
    modelProvider: text("model_provider").notNull(),
    modelName: text("model_name").notNull(),
    modelVersion: text("model_version"),
    inputHash: char("input_hash", { length: 64 }).notNull(),
    output: jsonb("output").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    reviewStatus: aiReviewStatus("review_status").notNull().default("GENERATED"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamptz("reviewed_at"),
  },
  (table) => [
    check(
      "ai_generations_input_hash_format",
      sql`${table.inputHash} ~ '^[0-9a-fA-F]{64}$'`,
    ),
    check(
      "ai_generations_confidence_range",
      sql`${table.confidence} is null or (${table.confidence} >= 0 and ${table.confidence} <= 1)`,
    ),
  ],
);

export const dataLineage = pgTable("data_lineage", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id),
  sourceType: text("source_type").notNull(),
  sourceId: uuid("source_id").notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  relationship: text("relationship").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});
