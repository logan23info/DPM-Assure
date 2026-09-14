import { sql } from "drizzle-orm";
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { membershipRole, organizations, users } from "./schema";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const organizationInvitationStatus = pgEnum("organization_invitation_status", [
  "PENDING",
  "ACCEPTED",
  "CANCELLED",
  "EXPIRED",
]);

export const organizationInvitations = pgTable(
  "organization_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    email: text("email").notNull(),
    role: membershipRole("role").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    status: organizationInvitationStatus("status").notNull().default("PENDING"),
    invitedBy: uuid("invited_by").notNull().references(() => users.id),
    invitedAt: timestamptz("invited_at").notNull().defaultNow(),
    expiresAt: timestamptz("expires_at").notNull(),
    acceptedBy: uuid("accepted_by").references(() => users.id),
    acceptedAt: timestamptz("accepted_at"),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    cancelledAt: timestamptz("cancelled_at"),
  },
  (table) => [
    index("organization_invitations_org_status_idx").on(table.organizationId, table.status, table.expiresAt),
    uniqueIndex("organization_invitations_pending_email_uq")
      .on(table.organizationId, sql`lower(${table.email})`)
      .where(sql`${table.status} = 'PENDING'`),
  ],
);
