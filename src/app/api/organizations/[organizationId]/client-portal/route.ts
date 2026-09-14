import { createCookieSessionResolver } from "@/auth/cookie-session";
import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions } from "@/auth/rbac";
import { requireAuthenticatedPrincipal } from "@/auth/session";
import { createClientEvidenceUploadIntent, finalizeClientEvidenceUpload } from "@/domain/client-portal/evidence-service";
import { listClientPortalRequests, submitPbcResponse } from "@/domain/client-portal/service";

export const runtime="nodejs";
type RouteContext={params:Promise<{organizationId:string}>};
export async function GET(request:Request,context:RouteContext){const{organizationId}=await context.params;let principal;try{principal=await requireAuthenticatedPrincipal(createCookieSessionResolver(request));}catch{return Response.json({error:"UNAUTHENTICATED"},{status:401});}try{const requests=await withAuthorizedTenantTransaction({principal,organizationId,requestId:crypto.randomUUID(),permission:permissions.clientPortalRead},listClientPortalRequests);return Response.json({requests});}catch{return Response.json({error:"FORBIDDEN"},{status:403});}}
export async function POST(request:Request,context:RouteContext){const{organizationId}=await context.params;let principal;try{principal=await requireAuthenticatedPrincipal(createCookieSessionResolver(request));}catch{return Response.json({error:"UNAUTHENTICATED"},{status:401});}let body:Record<string,unknown>;try{body=await request.json();}catch{return Response.json({error:"INVALID_JSON"},{status:400});}try{const result=await withAuthorizedTenantTransaction({principal,organizationId,requestId:crypto.randomUUID(),permission:permissions.clientPbcRespond},async tx=>{switch(body.action){case"create_evidence_upload_intent":return createClientEvidenceUploadIntent(tx,body.input as Record<string,unknown>);case"finalize_evidence_upload":return finalizeClientEvidenceUpload(tx,body.input as Record<string,unknown>);default:return submitPbcResponse(tx,body);}});return Response.json({result});}catch(error){return Response.json({error:"CLIENT_PORTAL_ACTION_REJECTED",message:error instanceof Error?error.message:"Client portal action rejected"},{status:400});}}
