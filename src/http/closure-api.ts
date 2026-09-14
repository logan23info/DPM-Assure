import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { approveReport, archiveEngagement, closeEngagement, createMonitoringProgram, freezeEngagement, generateReport, moveToReview, recordChangeEvent, recordMonitoringCheck, recordReassessment, reviewWorkpaper, signoffEngagement } from "@/domain/engagement/closure-service";

export async function executeClosureAction(tx:AuthorizedTenantTransaction,body:Record<string,unknown>){switch(body.action){
 case"move_to_review":return moveToReview(tx,body);
 case"review_workpaper":return reviewWorkpaper(tx,body);
 case"signoff":return signoffEngagement(tx,body);
 case"generate_report":return generateReport(tx,body);
 case"approve_report":return approveReport(tx,body);
 case"close_engagement":return closeEngagement(tx,body);
 case"freeze":return freezeEngagement(tx,body);
 case"archive":return archiveEngagement(tx,body);
 case"create_monitoring_program":return createMonitoringProgram(tx,body);
 case"record_monitoring_check":return recordMonitoringCheck(tx,body);
 case"record_change_event":return recordChangeEvent(tx,body);
 case"record_reassessment":return recordReassessment(tx,body);
 default:throw new Error("Unsupported closure action");}}
