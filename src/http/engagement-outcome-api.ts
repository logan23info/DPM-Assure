import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { approveRiskAcceptance, assessFindingRisk, closeFinding, completeRemediation, createException, createFinding, createObservation, createRemediation, createRiskAcceptance, recordRetest } from "@/domain/engagement/outcome-service";

export async function executeOutcomeAction(tx:AuthorizedTenantTransaction,body:Record<string,unknown>){
 switch(body.action){
  case "create_exception": return createException(tx,body);
  case "create_observation": return createObservation(tx,body);
  case "create_finding": return createFinding(tx,body);
  case "assess_risk": return assessFindingRisk(tx,body);
  case "create_remediation": return createRemediation(tx,body);
  case "complete_remediation": return completeRemediation(tx,body);
  case "create_risk_acceptance": return createRiskAcceptance(tx,body);
  case "approve_risk_acceptance": return approveRiskAcceptance(tx,body);
  case "record_retest": return recordRetest(tx,body);
  case "close_finding": return closeFinding(tx,body);
  default: throw new Error("Unsupported outcome action");
 }
}
