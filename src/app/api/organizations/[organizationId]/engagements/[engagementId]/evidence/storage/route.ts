import { createCookieSessionResolver } from "@/auth/cookie-session";
import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions } from "@/auth/rbac";
import { requireAuthenticatedPrincipal } from "@/auth/session";
import { createEvidenceDownload, createEvidenceUploadIntent, finalizeEvidenceUpload } from "@/domain/evidence/object-service";

export const runtime="nodejs";
type RouteContext={params:Promise<{organizationId:string;engagementId:string}>};
export async function POST(request:Request,context:RouteContext){
 const{organizationId,engagementId}=await context.params;let principal;try{principal=await requireAuthenticatedPrincipal(createCookieSessionResolver(request));}catch{return Response.json({error:"UNAUTHENTICATED"},{status:401});}
 let body:Record<string,unknown>;try{body=await request.json();}catch{return Response.json({error:"INVALID_JSON"},{status:400});}
 try{const result=await withAuthorizedTenantTransaction({principal,organizationId,requestId:crypto.randomUUID(),permission:permissions.engagementRead},async tx=>{
  switch(body.action){
   case"create_upload_intent":return createEvidenceUploadIntent(tx,{...body.input as Record<string,unknown>,engagementId});
   case"finalize_upload":return finalizeEvidenceUpload(tx,body.input as Record<string,unknown>);
   case"create_download":return createEvidenceDownload(tx,(body.input as Record<string,unknown>)?.evidenceId);
   default:throw new Error("Unsupported storage action");
  }
 });return Response.json({result});}catch(error){return Response.json({error:"EVIDENCE_STORAGE_REJECTED",message:error instanceof Error?error.message:"Evidence storage action rejected"},{status:400});}
}
