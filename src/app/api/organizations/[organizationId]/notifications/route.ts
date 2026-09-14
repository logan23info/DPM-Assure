import { createCookieSessionResolver } from "@/auth/cookie-session";
import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions } from "@/auth/rbac";
import { requireAuthenticatedPrincipal } from "@/auth/session";
import { listMyNotifications, markNotificationRead } from "@/domain/notifications/service";

export const runtime="nodejs";
type RouteContext={params:Promise<{organizationId:string}>};
async function principal(request:Request){return requireAuthenticatedPrincipal(createCookieSessionResolver(request));}
export async function GET(request:Request,context:RouteContext){const{organizationId}=await context.params;try{const p=await principal(request);const result=await withAuthorizedTenantTransaction({principal:p,organizationId,requestId:crypto.randomUUID(),permission:permissions.organizationRead},tx=>listMyNotifications(tx));return Response.json({notifications:result});}catch(error){return Response.json({error:"NOTIFICATIONS_REJECTED",message:error instanceof Error?error.message:"Rejected"},{status:400});}}
export async function POST(request:Request,context:RouteContext){const{organizationId}=await context.params;try{const p=await principal(request);const body=await request.json() as {action?:string;notificationId?:string};if(body.action!=="mark_read")return Response.json({error:"UNKNOWN_ACTION"},{status:400});const result=await withAuthorizedTenantTransaction({principal:p,organizationId,requestId:crypto.randomUUID(),permission:permissions.organizationRead},tx=>markNotificationRead(tx,String(body.notificationId??"")));return Response.json({result});}catch(error){return Response.json({error:"NOTIFICATIONS_REJECTED",message:error instanceof Error?error.message:"Rejected"},{status:400});}}
