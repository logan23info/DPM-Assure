import { requireAuthenticatedPrincipal, type SessionResolver } from "@/auth/session";
import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions } from "@/auth/rbac";
import {
  approveAuditPlan,
  assignEngagementUser,
  createAuditPlan,
  recordIndependenceCheck,
  recordRiskAssessment,
  resolveIndependenceConflict,
  startEngagementTesting,
} from "@/domain/engagement/governance-service";

function json(body: unknown, status = 200) { return Response.json(body, { status }); }

export function createEngagementGovernanceApi(resolver: SessionResolver) {
  return {
    async post(organizationId: string, engagementId: string, request: Request) {
      let body: Record<string, unknown>;
      try { body = await request.json() as Record<string, unknown>; } catch { return json({ error: "INVALID_JSON" }, 400); }
      try {
        const principal = await requireAuthenticatedPrincipal(resolver);
        const action = String(body.action ?? "");
        const permission = action === "approve_plan" ? permissions.engagementPlanApprove : action === "start_testing" || action === "resolve_conflict" ? permissions.engagementStartTesting : permissions.engagementGovernanceManage;
        const result = await withAuthorizedTenantTransaction({ principal, organizationId, requestId: crypto.randomUUID(), permission }, async (tx) => {
          switch (action) {
            case "assign_user": return assignEngagementUser(tx, { engagementId, userId: String(body.userId ?? ""), assignmentRole: body.assignmentRole as "AUDIT_MANAGER" | "LEAD_AUDITOR" | "AUDITOR" | "REVIEWER" });
            case "record_independence": return recordIndependenceCheck(tx, { engagementId, subjectUserId: String(body.subjectUserId ?? ""), result: body.result as "CLEAR" | "CONFLICT", conflictDetails: typeof body.conflictDetails === "string" ? body.conflictDetails : null });
            case "resolve_conflict": return resolveIndependenceConflict(tx, { independenceCheckId: String(body.independenceCheckId ?? "") });
            case "record_risk": return recordRiskAssessment(tx, { engagementId, methodVersion: String(body.methodVersion ?? ""), inherentScore: body.inherentScore == null ? null : Number(body.inherentScore), controlScore: body.controlScore == null ? null : Number(body.controlScore), residualScore: body.residualScore == null ? null : Number(body.residualScore), rationale: String(body.rationale ?? "") });
            case "create_plan": return createAuditPlan(tx, { engagementId, objectives: String(body.objectives ?? ""), scopeSummary: String(body.scopeSummary ?? ""), samplingApproach: typeof body.samplingApproach === "string" ? body.samplingApproach : null });
            case "approve_plan": return approveAuditPlan(tx, { auditPlanId: String(body.auditPlanId ?? "") });
            case "start_testing": return startEngagementTesting(tx, { engagementId });
            default: throw new Error("Unsupported governance action");
          }
        });
        return json({ result });
      } catch (error) {
        if (error instanceof Error && error.name === "AuthenticationRequiredError") return json({ error: "UNAUTHENTICATED" }, 401);
        if (error instanceof Error && /Invalid|must|required|not found|cannot|only|match|allowed|ready|resolved/i.test(error.message)) return json({ error: "INVALID_REQUEST", message: error.message }, 400);
        return json({ error: "FORBIDDEN" }, 403);
      }
    },
  };
}
