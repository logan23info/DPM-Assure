import { withAuthorizedTenantTransaction } from "@/auth/authorize";
import { permissions } from "@/auth/rbac";
import { requireAuthenticatedPrincipal, type SessionResolver } from "@/auth/session";
import {
  addSampleItem, createPbcRequest, createProcedure, createSample, createWorkpaper,
  defineProcedureExecution, linkWorkpaperRequirement, linkWorkpaperSample, reviewSample,
} from "@/domain/engagement/execution-service";

function json(body: unknown,status=200){return Response.json(body,{status});}

export function createEngagementExecutionApi(resolver:SessionResolver){return{async post(organizationId:string,engagementId:string,request:Request){let principal;try{principal=await requireAuthenticatedPrincipal(resolver);}catch{return json({error:"UNAUTHENTICATED"},401);}let body:any;try{body=await request.json();}catch{return json({error:"INVALID_JSON"},400);}const action=body?.action;const input={...(body?.input??{}),engagementId};try{return await withAuthorizedTenantTransaction({principal,organizationId,requestId:crypto.randomUUID(),permission:permissions.engagementRead},async(tx)=>{let result:unknown;switch(action){case"create_sample":result=await createSample(tx,input);break;case"add_sample_item":result=await addSampleItem(tx,body.input);break;case"review_sample":result=await reviewSample(tx,body.input);break;case"create_workpaper":result=await createWorkpaper(tx,input);break;case"link_workpaper_requirement":result=await linkWorkpaperRequirement(tx,body.input);break;case"link_workpaper_sample":result=await linkWorkpaperSample(tx,body.input);break;case"create_procedure":result=await createProcedure(tx,body.input);break;case"define_procedure_execution":result=await defineProcedureExecution(tx,body.input);break;case"create_pbc":result=await createPbcRequest(tx,input);break;default:return json({error:"UNKNOWN_ACTION"},400);}return json({result});});}catch(error){return json({error:"EXECUTION_REJECTED",message:error instanceof Error?error.message:"Execution action rejected"},400);}}};}
