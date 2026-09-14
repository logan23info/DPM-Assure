import { integer, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { organizations, requirements, sources, users } from "./schema";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const applicabilityResult = pgEnum("applicability_result", [
  "APPLICABLE",
  "NOT_APPLICABLE",
  "REVIEW_REQUIRED",
]);

export const obligationOffsetUnit = pgEnum("obligation_offset_unit", [
  "HOURS",
  "DAYS",
  "CALENDAR_MONTHS",
]);

export const obligationInstanceStatus = pgEnum("obligation_instance_status", [
  "OPEN",
  "SATISFIED",
  "CANCELLED",
]);

export const complianceProfiles = pgTable("compliance_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  validatedBy: uuid("validated_by").notNull().references(() => users.id),
  validatedAt: timestamptz("validated_at").notNull().defaultNow(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export const complianceProfileFacts = pgTable(
  "compliance_profile_facts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    profileId: uuid("profile_id").notNull().references(() => complianceProfiles.id),
    factKey: text("fact_key").notNull(),
    factValue: text("fact_value").notNull(),
    sourceReference: text("source_reference").notNull(),
    validatedBy: uuid("validated_by").notNull().references(() => users.id),
    validatedAt: timestamptz("validated_at").notNull().defaultNow(),
  },
  (table) => [unique("compliance_profile_facts_profile_key_uq").on(table.profileId, table.factKey)],
);

export const obligationRules = pgTable(
  "obligation_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ruleKey: text("rule_key").notNull(),
    version: integer("version").notNull(),
    requirementId: uuid("requirement_id").notNull().references(() => requirements.id),
    sourceId: uuid("source_id").notNull().references(() => sources.id),
    jurisdiction: text("jurisdiction").notNull(),
    triggerType: text("trigger_type").notNull(),
    offsetValue: integer("offset_value").notNull(),
    offsetUnit: obligationOffsetUnit("offset_unit").notNull(),
    conditionFacts: jsonb("condition_facts").$type<Record<string, string>>().notNull().default({}),
    effectiveAt: timestamptz("effective_at").notNull(),
    retiredAt: timestamptz("retired_at"),
    status: text("status").notNull().default("ACTIVE"),
    rationale: text("rationale").notNull(),
    validatedBy: uuid("validated_by").notNull().references(() => users.id),
    validatedAt: timestamptz("validated_at").notNull().defaultNow(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [unique("obligation_rules_key_version_uq").on(table.ruleKey, table.version)],
);

export const applicabilityDeterminations = pgTable(
  "applicability_determinations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    profileId: uuid("profile_id").notNull().references(() => complianceProfiles.id),
    obligationRuleId: uuid("obligation_rule_id").notNull().references(() => obligationRules.id),
    result: applicabilityResult("result").notNull(),
    rationale: text("rationale").notNull(),
    factSnapshot: jsonb("fact_snapshot").$type<Record<string, string>>().notNull(),
    evaluatedBy: uuid("evaluated_by").notNull().references(() => users.id),
    evaluatedAt: timestamptz("evaluated_at").notNull().defaultNow(),
  },
  (table) => [unique("applicability_profile_rule_uq").on(table.profileId, table.obligationRuleId)],
);

export const obligationInstances = pgTable("obligation_instances", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  profileId: uuid("profile_id").notNull().references(() => complianceProfiles.id),
  applicabilityDeterminationId: uuid("applicability_determination_id").notNull().references(() => applicabilityDeterminations.id),
  obligationRuleId: uuid("obligation_rule_id").notNull().references(() => obligationRules.id),
  privacyRecordType: text("privacy_record_type"),
  privacyRecordId: uuid("privacy_record_id"),
  triggerAt: timestamptz("trigger_at").notNull(),
  dueAt: timestamptz("due_at").notNull(),
  status: obligationInstanceStatus("status").notNull().default("OPEN"),
  sourceReference: text("source_reference").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  satisfiedAt: timestamptz("satisfied_at"),
  satisfiedBy: uuid("satisfied_by").references(() => users.id),
});
