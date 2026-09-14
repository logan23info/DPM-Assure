import { requireAuthenticatedPrincipal, type SessionResolver } from "@/auth/session";
import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions } from "@/auth/rbac";
import { decideRequirementApplicability, defineEngagementScope, selectEngagementFramework } from "@/domain/engagement/scope-service";

function json(body: unknown, status = 200) { return Response.json(body, { status }); }

export function createEngagementScopeApi(resolver: SessionResolver) {
  return {
    async post(organizationId: string, engagementId: string, request: Request) {
      let body: Record<string, unknown>;
      try { body = await request.json() as Record<string, unknown>; } catch { return json({ error: "INVALID_JSON" }, 400); }
      try {
        const principal = await requireAuthenticatedPrincipal(resolver);
        const result = await withAuthorizedTenantTransaction({ principal, organizationId, requestId: crypto.randomUUID(), permission: permissions.engagementGovernanceManage }, async (tx) => {
          switch (String(body.action ?? "")) {
            case "select_framework": return selectEngagementFramework(tx, { engagementId, frameworkVersionId: String(body.frameworkVersionId ?? "") });
            case "define_scope": return defineEngagementScope(tx, { engagementId, name: String(body.name ?? ""), description: typeof body.description === "string" ? body.description : null, scopeType: String(body.scopeType ?? ""), inScope: body.inScope !== false, rationale: String(body.rationale ?? "") });
            case "decide_applicability": return decideRequirementApplicability(tx, { engagementId, requirementId: String(body.requirementId ?? ""), decision: body.decision as "APPLICABLE" | "NOT_APPLICABLE", rationale: String(body.rationale ?? "") });
            default: throw new Error("Unsupported scope action");
          }
        });
        return json({ result });
      } catch (error) {
        if (error instanceof Error && error.name === "AuthenticationRequiredError") return json({ error: "UNAUTHENTICATED" }, 401);
        if (error instanceof Error && /Invalid|must|required|not found|only|already/i.test(error.message)) return json({ error: "INVALID_REQUEST", message: error.message }, 400);
        return json({ error: "FORBIDDEN" }, 403);
      }
    },
  };
}
