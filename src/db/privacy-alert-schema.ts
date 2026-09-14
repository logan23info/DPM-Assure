import { pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { organizations, users } from "./schema";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const privacyAlertStatus = pgEnum("privacy_alert_status", [
  "OPEN",
  "ACKNOWLEDGED",
  "RESOLVED",
]);

export const privacyAlertSeverity = pgEnum("privacy_alert_severity", [
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const privacyAlerts = pgTable(
  "privacy_alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    recordType: text("record_type").notNull(),
    recordId: uuid("record_id").notNull(),
    alertType: text("alert_type").notNull(),
    severity: privacyAlertSeverity("severity").notNull(),
    dueAt: timestamptz("due_at").notNull(),
    status: privacyAlertStatus("status").notNull().default("OPEN"),
    assignedTo: uuid("assigned_to").references(() => users.id),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
    acknowledgedAt: timestamptz("acknowledged_at"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamptz("resolved_at"),
    sourceReference: text("source_reference"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("privacy_alerts_org_record_type_due_key").on(
      table.organizationId,
      table.recordType,
      table.recordId,
      table.alertType,
      table.dueAt,
    ),
  ],
);
