import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { requireAuthenticatedPrincipal, type SessionResolver } from "@/auth/session";
import { permissions } from "@/auth/rbac";
import { createEngagement, listEngagements } from "@/domain/engagement/service";
import type { CreateEngagementInput } from "@/domain/engagement/validation";

function json(body: unknown, status = 200) { return Response.json(body, { status }); }

export function createEngagementApi(resolver: SessionResolver) {
  return {
    async get(organizationId: string) {
      try {
        const principal = await requireAuthenticatedPrincipal(resolver);
        const result = await withAuthorizedTenantTransaction({ principal, organizationId, requestId: crypto.randomUUID(), permission: permissions.engagementRead }, listEngagements);
        return json({ engagements: result });
      } catch (error) {
        if (error instanceof Error && error.name === "AuthenticationRequiredError") return json({ error: "UNAUTHENTICATED" }, 401);
        return json({ error: "FORBIDDEN" }, 403);
      }
    },
    async post(organizationId: string, request: Request) {
      let input: unknown;
      try { input = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }
      try {
        const principal = await requireAuthenticatedPrincipal(resolver);
        const result = await withAuthorizedTenantTransaction({ principal, organizationId, requestId: crypto.randomUUID(), permission: permissions.engagementCreate }, (tx) => createEngagement(tx, input as CreateEngagementInput));
        return json({ engagement: result }, 201);
      } catch (error) {
        if (error instanceof Error && error.name === "AuthenticationRequiredError") return json({ error: "UNAUTHENTICATED" }, 401);
        if (error instanceof Error && /required|invalid|must|date|uuid/i.test(error.message)) return json({ error: "INVALID_INPUT", message: error.message }, 400);
        return json({ error: "FORBIDDEN" }, 403);
      }
    },
  };
}
