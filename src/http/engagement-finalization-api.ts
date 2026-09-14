import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { approveReport, closeEngagement, enterReview, freezeEngagement, generateReport, reviewWorkpaper, signoffEngagement } from "@/domain/engagement/finalization-service";

export async function executeFinalizationAction(tx:AuthorizedTenantTransaction,body:Record<string,unknown>){switch(body.action){case"enter_review":return enterReview(tx,body);case"review_workpaper":return reviewWorkpaper(tx,body);case"signoff":return signoffEngagement(tx,body);case"generate_report":return generateReport(tx,body);case"approve_report":return approveReport(tx,body);case"close_engagement":return closeEngagement(tx,body);case"freeze_engagement":return freezeEngagement(tx,body);default:throw new Error("Unsupported finalization action");}}
