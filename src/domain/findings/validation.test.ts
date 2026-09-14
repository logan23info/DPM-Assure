import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateMultiplicativeRiskScore,
  validateFinding,
  validateObservation,
  validateRiskAssessment,
} from "./validation";

const ids = {
  engagementId: "11111111-1111-4111-8111-111111111111",
  workpaperId: "22222222-2222-4222-8222-222222222222",
  testResultId: "33333333-3333-4333-8333-333333333333",
  exceptionId: "44444444-4444-4444-8444-444444444444",
  observationId: "55555555-5555-4555-8555-555555555555",
  findingId: "66666666-6666-4666-8666-666666666666",
};

test("observation validation preserves its distinct type", () => {
  const result = validateObservation({
    engagementId: ids.engagementId,
    workpaperId: ids.workpaperId,
    testResultId: ids.testResultId,
    observationType: "IMPROVEMENT_OPPORTUNITY",
    description: "  Improve evidence retention metadata  ",
  });
  assert.equal(result.description, "Improve evidence retention metadata");
  assert.equal(result.observationType, "IMPROVEMENT_OPPORTUNITY");
});

test("finding requires exactly one primary source", () => {
  assert.throws(() => validateFinding({
    engagementId: ids.engagementId,
    title: "No source",
    description: "Missing source",
    findingType: "CONTROL_DEFICIENCY",
  }));

  assert.throws(() => validateFinding({
    engagementId: ids.engagementId,
    exceptionId: ids.exceptionId,
    observationId: ids.observationId,
    title: "Two sources",
    description: "Ambiguous primary source",
    findingType: "CONTROL_DEFICIENCY",
  }));

  assert.doesNotThrow(() => validateFinding({
    engagementId: ids.engagementId,
    exceptionId: ids.exceptionId,
    title: "Exception-derived finding",
    description: "Formalized from failed testing",
    findingType: "CONTROL_DEFICIENCY",
  }));
});

test("risk score is deterministic and bounded", () => {
  assert.equal(calculateMultiplicativeRiskScore(3, 4), 12);
  assert.equal(calculateMultiplicativeRiskScore(2.25, 1.5), 3.38);
  assert.throws(() => calculateMultiplicativeRiskScore(6, 1));
  assert.throws(() => calculateMultiplicativeRiskScore(1, -1));
});

test("risk assessment pins the methodology version and derived score", () => {
  const result = validateRiskAssessment({
    findingId: ids.findingId,
    likelihood: 4,
    impact: 5,
    methodVersion: "DPM-RISK-MULTIPLICATIVE-1",
    rationale: "High likelihood and severe privacy impact",
  });
  assert.equal(result.score, 20);
  assert.throws(() => validateRiskAssessment({ ...result, methodVersion: "UNKNOWN" }));
});
