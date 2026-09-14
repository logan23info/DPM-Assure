import assert from "node:assert/strict";
import test from "node:test";

import {
  ExecutionValidationError,
  validateCreateSampleInput,
  validateDefineProcedureExecutionInput,
  validateReviewSampleInput,
} from "./execution-validation";

const engagementId = "40000000-0000-4000-8000-000000000001";
const requirementId = "50000000-0000-4000-8000-000000000001";
const procedureId = "60000000-0000-4000-8000-000000000001";
const sampleId = "70000000-0000-4000-8000-000000000001";

test("sample size cannot exceed the population", () => {
  assert.throws(
    () =>
      validateCreateSampleInput({
        engagementId,
        requirementId,
        populationDescription: "Quarterly access reviews",
        populationSize: 10,
        samplingMethod: "random",
        sampleSize: 11,
        selectionBasis: "Representative selection",
      }),
    (error: unknown) =>
      error instanceof ExecutionValidationError &&
      error.issues.includes("sampleSize must not exceed populationSize"),
  );
});

test("sample review requires rationale", () => {
  assert.throws(
    () =>
      validateReviewSampleInput({
        sampleId,
        decision: "APPROVED",
        rationale: "   ",
      }),
    ExecutionValidationError,
  );
});

test("procedure execution requires objective evidence and method", () => {
  const result = validateDefineProcedureExecutionInput({
    procedureId,
    requirementId,
    testObjective: "Confirm access reviews are completed and approved.",
    expectedEvidence: "Approved quarterly access review records.",
    testMethod: "Inspect the approved sample and verify reviewer approval and completion date.",
  });

  assert.equal(result.requirementId, requirementId);
  assert.match(result.testObjective, /Confirm access reviews/);
});
