import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";

import type { AuthenticatedPrincipal } from "@/auth/session";
import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions, requirePermission, type MembershipRole } from "@/auth/rbac";
import { requireActiveMembership } from "@/auth/organization-context";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { memberships, users } from "@/db/schema";
import { organizationInvitations } from "@/db/onboarding-schema";
import { recordDomainChange } from "@/domain/record-event";

const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
const ASSIGNABLE_ROLES: readonly MembershipRole[] = [
  "ORG_ADMIN",
  "AUDIT_MANAGER",
  "LEAD_AUDITOR",
  "AUDITOR",
  "REVIEWER",
  "CLIENT",
  "VIEWER",
];

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function opaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("A valid email is required");
  return normalized;
}

function assertAssignableRole(role: MembershipRole): void {
  if (!ASSIGNABLE_ROLES.includes(role)) throw new Error("Role cannot be assigned through organization onboarding");
}

export interface InvitationIssue {
  readonly id: string;
  readonly email: string;
  readonly role: MembershipRole;
  readonly token: string;
  readonly expiresAt: Date;
}

export async function listOrganizationMembers(transaction: AuthorizedTenantTransaction) {
  requirePermission(transaction.membership.role, permissions.organizationManageUsers);
  return transaction.db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      role: memberships.role,
      status: memberships.status,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, transaction.context.organizationId))
    .orderBy(asc(users.email));
}

export async function listPendingInvitations(transaction: AuthorizedTenantTransaction) {
  requirePermission(transaction.membership.role, permissions.organizationManageUsers);
  return transaction.db
    .select()
    .from(organizationInvitations)
    .where(and(
      eq(organizationInvitations.organizationId, transaction.context.organizationId),
      eq(organizationInvitations.status, "PENDING"),
    ))
    .orderBy(asc(organizationInvitations.expiresAt));
}

export async function inviteOrganizationMember(
  transaction: AuthorizedTenantTransaction,
  input: { email: string; role: MembershipRole },
): Promise<InvitationIssue> {
  requirePermission(transaction.membership.role, permissions.organizationManageUsers);
  const email = normalizeEmail(input.email);
  assertAssignableRole(input.role);

  const existing = await transaction.db.execute(sql`
    select 1
      from memberships m
      join users u on u.id=m.user_id
     where m.organization_id=${transaction.context.organizationId}::uuid
       and lower(u.email)=lower(${email})
       and m.status='ACTIVE'
     limit 1
  `);
  if (existing.rows.length > 0) throw new Error("User is already an active organization member");

  const token = opaqueToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const [created] = await transaction.db
    .insert(organizationInvitations)
    .values({
      organizationId: transaction.context.organizationId,
      email,
      role: input.role,
      tokenHash: sha256(token),
      invitedBy: transaction.principal.userId,
      expiresAt,
    })
    .returning();
  if (!created) throw new Error("Invitation creation did not return a row");

  await recordDomainChange(transaction, {
    eventType: "organization.invitation.created",
    aggregateType: "organization_invitation",
    aggregateId: created.id,
    action: "organization.invitation.create",
    entityType: "organization_invitation",
    payload: { invitationId: created.id, email, role: input.role },
    newValues: { email, role: input.role, status: created.status, expiresAt },
    metadata: { tokenPersisted: false },
  });

  return { id: created.id, email, role: input.role, token, expiresAt };
}

export async function cancelOrganizationInvitation(
  transaction: AuthorizedTenantTransaction,
  invitationId: string,
): Promise<void> {
  requirePermission(transaction.membership.role, permissions.organizationManageUsers);
  await transaction.db.execute(sql`select cancel_organization_invitation(${invitationId}::uuid)`);
  await recordDomainChange(transaction, {
    eventType: "organization.invitation.cancelled",
    aggregateType: "organization_invitation",
    aggregateId: invitationId,
    action: "organization.invitation.cancel",
    entityType: "organization_invitation",
    payload: { invitationId },
    newValues: { status: "CANCELLED" },
  });
}

export async function updateOrganizationMember(
  transaction: AuthorizedTenantTransaction,
  input: { membershipId: string; role?: MembershipRole; status?: "ACTIVE" | "INACTIVE" },
) {
  requirePermission(transaction.membership.role, permissions.organizationManageUsers);
  if (!input.role && !input.status) throw new Error("A role or status change is required");
  if (input.role) assertAssignableRole(input.role);

  const [current] = await transaction.db
    .select()
    .from(memberships)
    .where(and(
      eq(memberships.id, input.membershipId),
      eq(memberships.organizationId, transaction.context.organizationId),
    ))
    .limit(1);
  if (!current) throw new Error("Membership not found in authorized organization");

  const [updated] = await transaction.db
    .update(memberships)
    .set({
      ...(input.role ? { role: input.role } : {}),
      ...(input.status ? { status: input.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(memberships.id, current.id))
    .returning();
  if (!updated) throw new Error("Membership update did not return a row");

  await recordDomainChange(transaction, {
    eventType: "organization.membership.updated",
    aggregateType: "membership",
    aggregateId: updated.id,
    action: "organization.membership.update",
    entityType: "membership",
    payload: { membershipId: updated.id, userId: updated.userId },
    oldValues: { role: current.role, status: current.status },
    newValues: { role: updated.role, status: updated.status },
  });
  return updated;
}

export async function acceptOrganizationInvitation(input: {
  principal: AuthenticatedPrincipal;
  organizationId: string;
  requestId: string;
  token: string;
}) {
  if (input.token.length < 32 || input.token.length > 512) throw new Error("Invalid invitation token");
  return withTenantTransaction(
    { userId: input.principal.userId, organizationId: input.organizationId, requestId: input.requestId },
    async (transaction) => {
      const result = await transaction.db.execute(sql`
        select accept_organization_invitation(${sha256(input.token)}::char(64)) as membership_id
      `);
      const membershipId = result.rows[0]?.membership_id;
      if (typeof membershipId !== "string") throw new Error("Invitation acceptance failed");

      const membership = await requireActiveMembership(
        transaction.db,
        input.principal.userId,
        input.organizationId,
      );
      const authorized: AuthorizedTenantTransaction = {
        ...transaction,
        principal: input.principal,
        membership,
      };
      await recordDomainChange(authorized, {
        eventType: "organization.invitation.accepted",
        aggregateType: "membership",
        aggregateId: membershipId,
        action: "organization.invitation.accept",
        entityType: "membership",
        payload: { membershipId, organizationId: input.organizationId },
        newValues: { role: membership.role, status: "ACTIVE" },
      });
      return membership;
    },
  );
}
