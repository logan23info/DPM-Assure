import { createCookieSessionResolver } from "@/auth/cookie-session";
import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions } from "@/auth/rbac";
import { requireAuthenticatedPrincipal } from "@/auth/session";
import { executePrivacyAction } from "@/http/privacy-operations-api";

export const runtime="nodejs";
type RouteContext={params:Promise<{organizationId:string}>};
export async function POST(request:Request,context:RouteContext){const{organizationId}=await context.params;let principal;try{principal=await requireAuthenticatedPrincipal(createCookieSessionResolver(request));}catch{return Response.json({error:"UNAUTHENTICATED"},{status:401});}let body:Record<string,unknown>;try{body=await request.json();}catch{return Response.json({error:"INVALID_JSON"},{status:400});}try{const result=await withAuthorizedTenantTransaction({principal,organizationId,requestId:crypto.randomUUID(),permission:permissions.privacyRead},tx=>executePrivacyAction(tx,body));return Response.json({result});}catch(error){return Response.json({error:"PRIVACY_ACTION_REJECTED",message:error instanceof Error?error.message:"Privacy action rejected"},{status:400});}}
