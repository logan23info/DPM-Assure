import assert from "node:assert/strict";
import test from "node:test";
import { assertSupportedAiTask } from "./provider";

test("permits advisory AI tasks",()=>{
  for(const task of ["DOCUMENT_SUMMARY","EVIDENCE_EXTRACTION","FINDING_DRAFT","GAP_ANALYSIS","MAPPING_SUGGESTION","REMEDIATION_SUGGESTION"]){
    assert.doesNotThrow(()=>assertSupportedAiTask(task));
  }
});

test("rejects authoritative or autonomous AI actions",()=>{
  for(const task of ["LEGAL_TRUTH","AUDIT_SIGNOFF","COMPLIANCE_CERTIFICATION","AUTO_CLOSE_FINDING"]){
    assert.throws(()=>assertSupportedAiTask(task),/Unsupported AI task/);
  }
});
