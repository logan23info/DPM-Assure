import { createCookieSessionResolver } from "@/auth/cookie-session";
import { createEngagementApi } from "@/http/engagement-api";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ organizationId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  return createEngagementApi(createCookieSessionResolver(request)).get(organizationId);
}

export async function POST(request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  return createEngagementApi(createCookieSessionResolver(request)).post(organizationId, request);
}
