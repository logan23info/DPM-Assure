import { createCookieSessionResolver } from "@/auth/cookie-session";
import { createOrganizationOnboardingApi } from "@/http/organization-onboarding-api";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ organizationId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  return createOrganizationOnboardingApi(createCookieSessionResolver(request)).get(organizationId);
}

export async function POST(request: Request, context: RouteContext) {
  const { organizationId } = await context.params;
  return createOrganizationOnboardingApi(createCookieSessionResolver(request)).post(organizationId, request);
}
