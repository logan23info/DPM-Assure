import assert from "node:assert/strict";
import test from "node:test";

import {
  EngagementGovernanceValidationError,
  validateAssignmentInput,
  validateCreateAuditPlanInput,
  validateIndependenceCheckInput,
  validateRiskAssessmentInput,
} from "./governance-validation";

const engagementId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";

test("accepts assurance assignment roles", () => {
  assert.deepEqual(
    validateAssignmentInput({
      engagementId,
      userId,
      assignmentRole: "AUDITOR",
    }),
    { engagementId, userId, assignmentRole: "AUDITOR" },
  );
});

test("rejects malformed governance UUIDs", () => {
  assert.throws(
    () =>
      validateAssignmentInput({
        engagementId: "not-a-uuid",
        userId,
        assignmentRole: "AUDITOR",
      }),
    EngagementGovernanceValidationError,
  );
});

test("conflicts require details", () => {
  assert.throws(
    () =>
      validateIndependenceCheckInput({
        engagementId,
        subjectUserId: userId,
        result: "CONFLICT",
      }),
    /conflictDetails is required/,
  );
});

test("clear independence checks cannot carry conflict details", () => {
  assert.throws(
    () =>
      validateIndependenceCheckInput({
        engagementId,
        subjectUserId: userId,
        result: "CLEAR",
        conflictDetails: "should not exist",
      }),
    /conflictDetails must be empty/,
  );
});

test("risk scores cannot be negative", () => {
  assert.throws(
    () =>
      validateRiskAssessmentInput({
        engagementId,
        methodVersion: "DPM-RISK-1",
        inherentScore: -1,
        rationale: "Risk rationale",
      }),
    /inherentScore must be a finite non-negative number/,
  );
});

test("audit plans require objectives and scope", () => {
  assert.throws(
    () =>
      validateCreateAuditPlanInput({
        engagementId,
        objectives: " ",
        scopeSummary: " ",
      }),
    EngagementGovernanceValidationError,
  );
});
