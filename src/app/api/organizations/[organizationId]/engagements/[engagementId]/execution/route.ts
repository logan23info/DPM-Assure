import { createCookieSessionResolver } from "@/auth/cookie-session";
import { createEngagementExecutionApi } from "@/http/engagement-execution-api";

export const runtime="nodejs";
type RouteContext={params:Promise<{organizationId:string;engagementId:string}>};
export async function POST(request:Request,context:RouteContext){const {organizationId,engagementId}=await context.params;return createEngagementExecutionApi(createCookieSessionResolver(request)).post(organizationId,engagementId,request);}
