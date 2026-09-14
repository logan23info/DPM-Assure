import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";

import { engagements, membershipRole, users } from "./schema";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Typed mirror for additive governance tables introduced after the foundation freeze.
 * SQL migrations remain authoritative for RLS, triggers, and transition gates.
 */
export const engagementAssignments = pgTable(
  "engagement_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    engagementId: uuid("engagement_id")
      .notNull()
      .references(() => engagements.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    assignmentRole: membershipRole("assignment_role").notNull(),
    active: boolean("active").notNull().default(true),
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => users.id),
    assignedAt: timestamptz("assigned_at").notNull().defaultNow(),
    endedAt: timestamptz("ended_at"),
  },
  (table) => [
    check(
      "engagement_assignments_assurance_role",
      sql`${table.assignmentRole} in ('AUDIT_MANAGER','LEAD_AUDITOR','AUDITOR','REVIEWER')`,
    ),
    check(
      "engagement_assignments_ended_after_assigned",
      sql`${table.endedAt} is null or ${table.endedAt} >= ${table.assignedAt}`,
    ),
    unique("engagement_assignments_engagement_user_key").on(
      table.engagementId,
      table.userId,
    ),
    index("engagement_assignments_engagement_active_idx").on(
      table.engagementId,
      table.active,
    ),
  ],
);
