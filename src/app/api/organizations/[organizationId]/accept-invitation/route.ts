import { createCookieSessionResolver } from "@/auth/cookie-session";
import { createOrganizationOnboardingApi } from "@/http/organization-onboarding-api";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ organizationId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const token = typeof body.token === "string" ? body.token : "";
  return createOrganizationOnboardingApi(createCookieSessionResolver(request)).accept(organizationId, token);
}
