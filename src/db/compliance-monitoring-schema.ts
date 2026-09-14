import { pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { obligationInstances, obligationRules, applicabilityDeterminations } from "./obligation-schema";
import { organizations, sources, users } from "./schema";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const complianceAlertStatus = pgEnum("compliance_alert_status", [
  "OPEN",
  "ACKNOWLEDGED",
  "RESOLVED",
]);

export const sourceChangeType = pgEnum("source_change_type", [
  "AMENDED",
  "SUPERSEDED",
  "RETIRED",
  "REVALIDATED",
]);

export const sourceChangeImpactStatus = pgEnum("source_change_impact_status", [
  "OPEN",
  "ASSESSED",
  "RESOLVED",
]);

export const sourceChangeEvents = pgTable("source_change_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  oldSourceId: uuid("old_source_id").notNull().references(() => sources.id),
  newSourceId: uuid("new_source_id").references(() => sources.id),
  changeType: sourceChangeType("change_type").notNull(),
  summary: text("summary").notNull(),
  effectiveAt: timestamptz("effective_at").notNull(),
  recordedBy: uuid("recorded_by").notNull().references(() => users.id),
  recordedAt: timestamptz("recorded_at").notNull().defaultNow(),
});

export const sourceChangeImpacts = pgTable(
  "source_change_impacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    sourceChangeEventId: uuid("source_change_event_id").notNull().references(() => sourceChangeEvents.id),
    obligationRuleId: uuid("obligation_rule_id").notNull().references(() => obligationRules.id),
    applicabilityDeterminationId: uuid("applicability_determination_id").notNull().references(() => applicabilityDeterminations.id),
    obligationInstanceId: uuid("obligation_instance_id").references(() => obligationInstances.id),
    status: sourceChangeImpactStatus("status").notNull().default("OPEN"),
    rationale: text("rationale").notNull(),
    assessedBy: uuid("assessed_by").references(() => users.id),
    assessedAt: timestamptz("assessed_at"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamptz("resolved_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("source_change_impacts_event_determination_obligation_uq").on(
      table.sourceChangeEventId,
      table.applicabilityDeterminationId,
      table.obligationInstanceId,
    ),
  ],
);

export const complianceAlerts = pgTable(
  "compliance_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    alertKey: text("alert_key").notNull(),
    alertType: text("alert_type").notNull(),
    obligationInstanceId: uuid("obligation_instance_id").references(() => obligationInstances.id),
    sourceChangeImpactId: uuid("source_change_impact_id").references(() => sourceChangeImpacts.id),
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    dueAt: timestamptz("due_at"),
    status: complianceAlertStatus("status").notNull().default("OPEN"),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
    acknowledgedAt: timestamptz("acknowledged_at"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamptz("resolved_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [unique("compliance_alerts_org_key_uq").on(table.organizationId, table.alertKey)],
);
