import { authorizeTenantTransaction } from "@/auth/authorize";
import type { SessionResolver } from "@/auth/session";
import { permissions } from "@/auth/rbac";
import { createEngagement, listEngagements } from "@/domain/engagement/service";

function json(body: unknown, status = 200) { return Response.json(body, { status }); }

export function createEngagementApi(resolveSession: SessionResolver) {
  return {
    async get(organizationId: string) {
      const principal = await resolveSession();
      if (!principal) return json({ error: "UNAUTHENTICATED" }, 401);
      try {
        const result = await authorizeTenantTransaction({ principal, organizationId, requestId: crypto.randomUUID(), permission: permissions.engagementRead }, listEngagements);
        return json({ engagements: result });
      } catch { return json({ error: "FORBIDDEN" }, 403); }
    },
    async post(organizationId: string, request: Request) {
      const principal = await resolveSession();
      if (!principal) return json({ error: "UNAUTHENTICATED" }, 401);
      let input: unknown;
      try { input = await request.json(); } catch { return json({ error: "INVALID_JSON" }, 400); }
      try {
        const result = await authorizeTenantTransaction({ principal, organizationId, requestId: crypto.randomUUID(), permission: permissions.engagementCreate }, (tx) => createEngagement(tx, input as never));
        return json({ engagement: result }, 201);
      } catch (error) {
        if (error instanceof Error && /required|invalid|must|date|uuid/i.test(error.message)) return json({ error: "INVALID_INPUT", message: error.message }, 400);
        return json({ error: "FORBIDDEN" }, 403);
      }
    },
  };
}
