import { createCookieSessionResolver } from "@/auth/cookie-session";
import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions } from "@/auth/rbac";
import { requireAuthenticatedPrincipal } from "@/auth/session";
import { assignPbcToClientUser, grantClientAccess, revokeClientAccess } from "@/domain/client-portal/service";

export const runtime="nodejs";
type RouteContext={params:Promise<{organizationId:string}>};
export async function POST(request:Request,context:RouteContext){const{organizationId}=await context.params;let principal;try{principal=await requireAuthenticatedPrincipal(createCookieSessionResolver(request));}catch{return Response.json({error:"UNAUTHENTICATED"},{status:401});}let body:Record<string,unknown>;try{body=await request.json();}catch{return Response.json({error:"INVALID_JSON"},{status:400});}try{const permission=body.action==="assign_pbc"?permissions.workpaperUpdate:permissions.organizationManageUsers;const result=await withAuthorizedTenantTransaction({principal,organizationId,requestId:crypto.randomUUID(),permission},async tx=>{switch(body.action){case"grant":return grantClientAccess(tx,body);case"revoke":return revokeClientAccess(tx,body);case"assign_pbc":return assignPbcToClientUser(tx,body);default:throw new Error("Unsupported client access action");}});return Response.json({result});}catch(error){return Response.json({error:"CLIENT_ACCESS_REJECTED",message:error instanceof Error?error.message:"Client access action rejected"},{status:400});}}
