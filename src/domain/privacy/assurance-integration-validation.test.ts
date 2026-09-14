import assert from "node:assert/strict";
import test from "node:test";

import {
  validatePrivacyAssuranceCandidateInput,
  validatePrivacyAssuranceDecisionRationale,
} from "./assurance-integration-validation";

test("evidence request candidates require suggested evidence", () => {
  assert.throws(() =>
    validatePrivacyAssuranceCandidateInput({
      engagementId: "engagement",
      privacyRecordType: "PROCESSING_ACTIVITY",
      privacyRecordId: "record",
      candidateType: "EVIDENCE_REQUEST",
      suggestedTitle: "Request evidence",
      rationale: "Evidence is needed",
    }),
  );
});

test("scope candidates do not require suggested evidence", () => {
  const validated = validatePrivacyAssuranceCandidateInput({
    engagementId: "engagement",
    privacyRecordType: "DPIA",
    privacyRecordId: "record",
    candidateType: "SCOPE",
    suggestedTitle: "DPIA scope",
    rationale: "Material privacy process",
  });
  assert.equal(validated.suggestedEvidence, null);
});

test("candidate text and decision rationale fail closed when blank", () => {
  assert.throws(() =>
    validatePrivacyAssuranceCandidateInput({
      engagementId: "engagement",
      privacyRecordType: "BREACH",
      privacyRecordId: "record",
      candidateType: "SCOPE",
      suggestedTitle: "   ",
      rationale: "Material incident",
    }),
  );
  assert.throws(() => validatePrivacyAssuranceDecisionRationale("   "));
});
