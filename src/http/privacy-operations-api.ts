import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import {
  createDataSubjectRequest, createDpiaAssessment, createInternationalTransfer,
  createProcessingActivity, recordPrivacyBreach, registerProcessor,
} from "@/domain/privacy/service";
import {
  activateProcessingActivity, activateProcessor, approveInProgressDpia, approveTransfer,
  startDpiaAssessment, submitTransferForReview, transitionDsr, transitionPrivacyBreach,
} from "@/domain/privacy/workflow-service";
import type { CreateDpiaInput, CreateDsrInput, CreateProcessingActivityInput, CreateTransferInput, RecordBreachInput, RegisterProcessorInput } from "@/domain/privacy/validation";

function dateOrUndefined(v:unknown){return typeof v==="string"&&v?new Date(v):undefined;}
export async function executePrivacyAction(tx:AuthorizedTenantTransaction,body:Record<string,unknown>){switch(body.action){
 case"create_activity":return createProcessingActivity(tx,body as unknown as CreateProcessingActivityInput);
 case"activate_activity":return activateProcessingActivity(tx,String(body.activityId??""),dateOrUndefined(body.nextReviewAt));
 case"create_dpia":return createDpiaAssessment(tx,body as unknown as CreateDpiaInput);
 case"start_dpia":return startDpiaAssessment(tx,String(body.dpiaId??""));
 case"approve_dpia":return approveInProgressDpia(tx,String(body.dpiaId??""));
 case"register_processor":return registerProcessor(tx,body as unknown as RegisterProcessorInput);
 case"activate_processor":return activateProcessor(tx,String(body.processorId??""),dateOrUndefined(body.nextReviewAt));
 case"create_transfer":return createInternationalTransfer(tx,body as unknown as CreateTransferInput);
 case"review_transfer":return submitTransferForReview(tx,String(body.transferId??""));
 case"approve_transfer":return approveTransfer(tx,String(body.transferId??""),dateOrUndefined(body.nextReviewAt));
 case"create_dsr":return createDataSubjectRequest(tx,body as unknown as CreateDsrInput);
 case"transition_dsr":return transitionDsr(tx,String(body.dsrId??""),{status:String(body.status??"") as "IDENTITY_VERIFICATION"|"IN_PROGRESS"|"ON_HOLD"|"COMPLETED"|"REJECTED"|"CANCELLED",identityVerifiedAt:dateOrUndefined(body.identityVerifiedAt),outcome:typeof body.outcome==="string"?body.outcome:undefined});
 case"record_breach":return recordPrivacyBreach(tx,body as unknown as RecordBreachInput);
 case"transition_breach":return transitionPrivacyBreach(tx,String(body.breachId??""),{status:String(body.status??"") as "TRIAGE"|"INVESTIGATING"|"CONTAINED"|"NOTIFICATION_ASSESSMENT"|"NOTIFIED"|"CLOSED",containmentSummary:typeof body.containmentSummary==="string"?body.containmentSummary:undefined,notificationRequired:typeof body.notificationRequired==="boolean"?body.notificationRequired:undefined,notificationRationale:typeof body.notificationRationale==="string"?body.notificationRationale:undefined,authorityNotifiedAt:dateOrUndefined(body.authorityNotifiedAt),subjectsNotifiedAt:dateOrUndefined(body.subjectsNotifiedAt)});
 default:throw new Error("Unsupported privacy operation");
}}
