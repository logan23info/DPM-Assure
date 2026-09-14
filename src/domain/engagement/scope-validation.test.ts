import assert from "node:assert/strict";
import test from "node:test";
import { ScopeValidationError, validateApplicabilityDecision, validateDefineScope, validateSelectFramework } from "./scope-validation";

const engagementId = "123e4567-e89b-42d3-a456-426614174000";
const frameworkVersionId = "123e4567-e89b-42d3-a456-426614174001";
const requirementId = "123e4567-e89b-42d3-a456-426614174002";

test("framework selection requires valid identifiers", () => {
  assert.deepEqual(validateSelectFramework({ engagementId, frameworkVersionId }), { engagementId, frameworkVersionId });
  assert.throws(() => validateSelectFramework({ engagementId: "bad", frameworkVersionId }), ScopeValidationError);
});

test("scope requires an explicit rationale and boundary type", () => {
  assert.equal(validateDefineScope({ engagementId, name: "Production SaaS", scopeType: "SYSTEM", inScope: true, rationale: "Processes customer personal data." }).name, "Production SaaS");
  assert.throws(() => validateDefineScope({ engagementId, name: "Production", scopeType: "SYSTEM", inScope: true, rationale: " " }), ScopeValidationError);
});

test("applicability decisions cannot be silently pending or lack rationale", () => {
  assert.equal(validateApplicabilityDecision({ engagementId, requirementId, decision: "APPLICABLE", rationale: "Service processes personal data covered by this requirement." }).decision, "APPLICABLE");
  assert.throws(() => validateApplicabilityDecision({ engagementId, requirementId, decision: "NOT_APPLICABLE", rationale: "" }), ScopeValidationError);
});
