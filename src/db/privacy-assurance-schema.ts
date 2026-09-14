import { pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { engagements, organizations, pbcRequests, users } from "./schema";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const privacyAssuranceCandidateType = pgEnum("privacy_assurance_candidate_type", [
  "SCOPE",
  "EVIDENCE_REQUEST",
]);

export const privacyAssuranceCandidateStatus = pgEnum("privacy_assurance_candidate_status", [
  "PROPOSED",
  "ACCEPTED",
  "REJECTED",
]);

export const privacyAssuranceCandidates = pgTable(
  "privacy_assurance_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    engagementId: uuid("engagement_id").notNull().references(() => engagements.id),
    privacyRecordType: text("privacy_record_type").notNull(),
    privacyRecordId: uuid("privacy_record_id").notNull(),
    candidateType: privacyAssuranceCandidateType("candidate_type").notNull(),
    suggestedTitle: text("suggested_title").notNull(),
    rationale: text("rationale").notNull(),
    suggestedEvidence: text("suggested_evidence"),
    status: privacyAssuranceCandidateStatus("status").notNull().default("PROPOSED"),
    proposedBy: uuid("proposed_by").notNull().references(() => users.id),
    proposedAt: timestamptz("proposed_at").notNull().defaultNow(),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamptz("decided_at"),
    decisionRationale: text("decision_rationale"),
    scopeId: uuid("scope_id"),
    pbcRequestId: uuid("pbc_request_id").references(() => pbcRequests.id),
  },
  (table) => [
    unique("privacy_assurance_candidates_source_type_uq").on(
      table.engagementId,
      table.privacyRecordType,
      table.privacyRecordId,
      table.candidateType,
    ),
  ],
);
