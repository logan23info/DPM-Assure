import "server-only";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import {
  AuthenticationRequiredError,
  requireAuthenticatedPrincipal,
  type SessionResolver,
} from "@/auth/session";
import { AuthorizationDeniedError, permissions, type MembershipRole } from "@/auth/rbac";
import { organizations } from "@/db/schema";
import {
  acceptOrganizationInvitation,
  cancelOrganizationInvitation,
  inviteOrganizationMember,
  listOrganizationMembers,
  listPendingInvitations,
  updateOrganizationMember,
} from "@/domain/organization/onboarding-service";
import { getEmailSender } from "@/email/resend";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = new Set<MembershipRole>([
  "ORG_ADMIN","AUDIT_MANAGER","LEAD_AUDITOR","AUDITOR","REVIEWER","CLIENT","VIEWER",
]);

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
function uuid(value: string, field: string): string {
  if (!UUID_RE.test(value)) throw new Error(`${field} must be a UUID`);
  return value;
}
function role(value: unknown): MembershipRole {
  if (typeof value !== "string" || !ROLES.has(value as MembershipRole)) throw new Error("Invalid assignable role");
  return value as MembershipRole;
}
function mapError(error: unknown): Response {
  if (error instanceof AuthenticationRequiredError) return json({ error: "AUTHENTICATION_REQUIRED" }, 401);
  if (error instanceof AuthorizationDeniedError) return json({ error: "AUTHORIZATION_DENIED" }, 403);
  if (error instanceof Error) return json({ error: "INVALID_REQUEST", message: error.message }, 400);
  return json({ error: "INTERNAL_ERROR" }, 500);
}

export function createOrganizationOnboardingApi(resolver: SessionResolver) {
  return {
    async get(organizationId: string): Promise<Response> {
      try {
        uuid(organizationId, "organizationId");
        const principal = await requireAuthenticatedPrincipal(resolver);
        return withAuthorizedTenantTransaction(
          { principal, organizationId, requestId: randomUUID(), permission: permissions.organizationManageUsers },
          async (transaction) => json({
            members: await listOrganizationMembers(transaction),
            invitations: await listPendingInvitations(transaction),
          }),
        );
      } catch (error) { return mapError(error); }
    },

    async post(organizationId: string, request: Request): Promise<Response> {
      try {
        uuid(organizationId, "organizationId");
        const principal = await requireAuthenticatedPrincipal(resolver);
        const body = await request.json() as Record<string, unknown>;
        if (typeof body.action !== "string") throw new Error("action is required");

        if (body.action === "invite") {
          if (typeof body.email !== "string") throw new Error("email is required");
          const result = await withAuthorizedTenantTransaction(
            { principal, organizationId, requestId: randomUUID(), permission: permissions.organizationManageUsers },
            async (transaction) => {
              const invitation = await inviteOrganizationMember(transaction, { email: body.email as string, role: role(body.role) });
              const [organization] = await transaction.db
                .select({ name: organizations.name })
                .from(organizations)
                .where(eq(organizations.id, organizationId))
                .limit(1);
              if (!organization) throw new Error("Organization not found");
              return { invitation, organizationName: organization.name };
            },
          );

          const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, "");
          if (!baseUrl) throw new Error("APP_BASE_URL is required to send invitations");
          const acceptUrl = `${baseUrl}/organizations/${organizationId}/accept-invitation?token=${encodeURIComponent(result.invitation.token)}`;
          await getEmailSender().sendOrganizationInvitation({
            to: result.invitation.email,
            organizationName: result.organizationName,
            role: result.invitation.role,
            acceptUrl,
            expiresAt: result.invitation.expiresAt,
          });
          return json({ invitation: { id: result.invitation.id, email: result.invitation.email, role: result.invitation.role, expiresAt: result.invitation.expiresAt } }, 201);
        }

        return withAuthorizedTenantTransaction(
          { principal, organizationId, requestId: randomUUID(), permission: permissions.organizationManageUsers },
          async (transaction) => {
            if (body.action === "cancel_invitation") {
              if (typeof body.invitationId !== "string") throw new Error("invitationId is required");
              await cancelOrganizationInvitation(transaction, uuid(body.invitationId, "invitationId"));
              return json({ ok: true });
            }
            if (body.action === "update_member") {
              if (typeof body.membershipId !== "string") throw new Error("membershipId is required");
              const status = body.status === undefined ? undefined : body.status;
              if (status !== undefined && status !== "ACTIVE" && status !== "INACTIVE") throw new Error("Invalid membership status");
              const memberUpdate: {
                membershipId: string;
                role?: MembershipRole;
                status?: "ACTIVE" | "INACTIVE";
              } = { membershipId: uuid(body.membershipId, "membershipId") };
              if (body.role !== undefined) memberUpdate.role = role(body.role);
              if (status !== undefined) memberUpdate.status = status;
              return json(await updateOrganizationMember(transaction, memberUpdate));
            }
            throw new Error("Unsupported onboarding action");
          },
        );
      } catch (error) { return mapError(error); }
    },

    async accept(organizationId: string, token: string): Promise<Response> {
      try {
        uuid(organizationId, "organizationId");
        const principal = await requireAuthenticatedPrincipal(resolver);
        const membership = await acceptOrganizationInvitation({
          principal,
          organizationId,
          requestId: randomUUID(),
          token,
        });
        return json({ membership });
      } catch (error) { return mapError(error); }
    },
  };
}
