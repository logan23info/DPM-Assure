import { createCookieSessionResolver } from "@/auth/cookie-session";
import { requireAuthenticatedPrincipal } from "@/auth/session";
import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { deletePlanningEngagement } from "@/domain/engagement/deletion-service";

export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{organizationId:string;engagementId:string}>}){
 const {organizationId,engagementId}=await params; let body:any; try{body=await request.json();}catch{return Response.json({message:"Invalid request"},{status:400});}
 try{const principal=await requireAuthenticatedPrincipal(createCookieSessionResolver(request)); const result=await withAuthorizedTenantTransaction({principal,organizationId,requestId:crypto.randomUUID(),permission:"engagement.update" as any},tx=>deletePlanningEngagement(tx,engagementId,body?.confirmation)); return Response.json({result});}catch(error){return Response.json({message:error instanceof Error?error.message:"Deletion rejected"},{status:400});}
}
