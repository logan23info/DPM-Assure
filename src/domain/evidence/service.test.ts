import assert from "node:assert/strict";
import test from "node:test";
import { assertConclusiveTestAllowed, deriveOverallGateResult } from "./validation";

const pass={identity:"PASS",provenance:"PASS",integrity:"PASS",authorization:"PASS",applicability:"PASS",temporal:"PASS",completeness:"PASS",chainOfCustody:"PASS"} as const;
test("all evidence dimensions passing produces PASS",()=>assert.equal(deriveOverallGateResult(pass),"PASS"));
test("a failed dimension dominates insufficient evidence",()=>assert.equal(deriveOverallGateResult({...pass,temporal:"INSUFFICIENT_EVIDENCE",integrity:"FAIL"}),"FAIL"));
test("insufficient evidence prevents a conclusive result",()=>assert.throws(()=>assertConclusiveTestAllowed("PASS","INSUFFICIENT_EVIDENCE"),/requires a PASS evidence gate/));
test("PASS gate permits conclusive FAIL",()=>assert.doesNotThrow(()=>assertConclusiveTestAllowed("FAIL","PASS")));
