import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { approveRiskAcceptance, assessFindingRisk, closeFinding, completeRemediation, createException, createFinding, createObservation, createRemediation, createRetest, createRiskAcceptance } from "@/domain/findings/service";

export async function executeFindingAction(tx:AuthorizedTenantTransaction,body:Record<string,unknown>){
 switch(body.action){
  case "create_observation": return createObservation(tx,body as never);
  case "create_exception": return createException(tx,body as never);
  case "create_finding": return createFinding(tx,body as never);
  case "assess_risk": return assessFindingRisk(tx,body as never);
  case "create_remediation": return createRemediation(tx,body);
  case "complete_remediation": return completeRemediation(tx,body);
  case "create_risk_acceptance": return createRiskAcceptance(tx,body);
  case "approve_risk_acceptance": return approveRiskAcceptance(tx,body);
  case "create_retest": return createRetest(tx,body);
  case "close_finding": return closeFinding(tx,body);
  default: throw new Error("Unsupported findings action");
 }
}
