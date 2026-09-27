import { createCookieSessionResolver } from "@/auth/cookie-session";
import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions } from "@/auth/rbac";
import { requireAuthenticatedPrincipal } from "@/auth/session";
import {
  createComplianceProfile,
  evaluateApplicability,
  listApplicabilityDeterminations,
  listComplianceProfileFacts,
  listComplianceProfiles,
  listObligationRules,
  listOpenObligations,
  materializeObligation,
  setComplianceProfileFact,
} from "@/domain/compliance/service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ organizationId: string }> };

async function principal(request: Request) {
  return requireAuthenticatedPrincipal(createCookieSessionResolver(request));
}

export async function GET(request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  try {
    const authenticated = await principal(request);
    const result = await withAuthorizedTenantTransaction(
      { principal: authenticated, organizationId, requestId: crypto.randomUUID(), permission: permissions.complianceRead },
      async (transaction) => {
        const [profiles, facts, rules, determinations, obligations] = await Promise.all([
          listComplianceProfiles(transaction),
          listComplianceProfileFacts(transaction),
          listObligationRules(transaction),
          listApplicabilityDeterminations(transaction),
          listOpenObligations(transaction),
        ]);
        return { profiles, facts, rules, determinations, obligations };
      },
    );
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: "COMPLIANCE_REJECTED", message: error instanceof Error ? error.message : "Compliance request rejected" }, { status: 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  try {
    const authenticated = await principal(request);
    const body = await request.json() as Record<string, unknown>;
    const result = await withAuthorizedTenantTransaction(
      { principal: authenticated, organizationId, requestId: crypto.randomUUID(), permission: permissions.complianceRead },
      async (transaction) => {
        switch (body.action) {
          case "create_profile":
            return createComplianceProfile(transaction, { name: String(body.name ?? ""), jurisdiction: String(body.jurisdiction ?? "") });
          case "set_fact":
            return setComplianceProfileFact(transaction, {
              profileId: String(body.profileId ?? ""),
              factKey: String(body.factKey ?? ""),
              factValue: String(body.factValue ?? ""),
              sourceReference: String(body.sourceReference ?? ""),
            });
          case "evaluate_applicability":
            return evaluateApplicability(transaction, String(body.profileId ?? ""), String(body.obligationRuleId ?? ""));
          case "materialize_obligation":
            return materializeObligation(transaction, {
              determinationId: String(body.determinationId ?? ""),
              triggerAt: new Date(String(body.triggerAt ?? "")),
              privacyRecordType: typeof body.privacyRecordType === "string" ? body.privacyRecordType : null,
              privacyRecordId: typeof body.privacyRecordId === "string" ? body.privacyRecordId : null,
            });
          default:
            throw new Error("Unsupported compliance action");
        }
      },
    );
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: "COMPLIANCE_REJECTED", message: error instanceof Error ? error.message : "Compliance request rejected" }, { status: 400 });
  }
}
