import { createCookieSessionResolver } from "@/auth/cookie-session";
import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions } from "@/auth/rbac";
import { requireAuthenticatedPrincipal } from "@/auth/session";
import { executeFinalizationAction } from "@/http/engagement-finalization-api";

export const runtime="nodejs";
type RouteContext={params:Promise<{organizationId:string;engagementId:string}>};
export async function POST(request:Request,context:RouteContext){const{organizationId,engagementId}=await context.params;let principal;try{principal=await requireAuthenticatedPrincipal(createCookieSessionResolver(request));}catch{return Response.json({error:"UNAUTHENTICATED"},{status:401});}let body:Record<string,unknown>;try{body=await request.json();}catch{return Response.json({error:"INVALID_JSON"},{status:400});}try{const result=await withAuthorizedTenantTransaction({principal,organizationId,requestId:crypto.randomUUID(),permission:permissions.engagementRead},async(tx)=>executeFinalizationAction(tx,{...body,engagementId}));return Response.json({result});}catch(error){return Response.json({error:"FINALIZATION_REJECTED",message:error instanceof Error?error.message:"Finalization action rejected"},{status:400});}}
