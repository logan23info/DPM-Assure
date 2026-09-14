import { createCookieSessionResolver } from "@/auth/cookie-session";
import { createEngagementScopeApi } from "@/http/engagement-scope-api";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ organizationId: string; engagementId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { organizationId, engagementId } = await context.params;
  return createEngagementScopeApi(createCookieSessionResolver(request)).post(organizationId, engagementId, request);
}
