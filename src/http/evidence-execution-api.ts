import type { AuthorizedTenantTransaction } from "@/auth/authorize";
import { evaluateEvidenceGate, recordCustodyEvent, recordTestResult, registerEvidence } from "@/domain/evidence/service";
import type { EvidenceGateDimensions, EvidenceRegistrationInput } from "@/domain/evidence/validation";

export async function executeEvidenceAction(tx:AuthorizedTenantTransaction,body:Record<string,unknown>){
 switch(body.action){
  case "registerEvidence": return registerEvidence(tx,body as unknown as EvidenceRegistrationInput);
  case "recordCustodyEvent": return recordCustodyEvent(tx,body);
  case "evaluateGate": return evaluateEvidenceGate(tx,{evidenceId:String(body.evidenceId??""),procedureId:typeof body.procedureId==="string"?body.procedureId:null,gateVersion:String(body.gateVersion??""),dimensions:body.dimensions as EvidenceGateDimensions,rationale:String(body.rationale??"")});
  case "recordTestResult": return recordTestResult(tx,body);
  default: throw new Error("Unsupported evidence action");
 }
}
