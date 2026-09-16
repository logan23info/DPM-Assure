import { createCookieSessionResolver } from "@/auth/cookie-session";
import { createPrivacyOperationsApi } from "@/http/privacy-operations-api";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{organizationId:string}>}){return createPrivacyOperationsApi(createCookieSessionResolver(request)).get((await params).organizationId);}
export async function POST(request:Request,{params}:{params:Promise<{organizationId:string}>}){return createPrivacyOperationsApi(createCookieSessionResolver(request)).post((await params).organizationId,request);}
