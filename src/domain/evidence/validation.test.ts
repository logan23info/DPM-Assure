import test from "node:test";
import assert from "node:assert/strict";
import { assertConclusiveTestAllowed, deriveOverallGateResult, validateEvidenceRegistration } from "./validation";

const allPass = {
  identity: "PASS", provenance: "PASS", integrity: "PASS", authorization: "PASS",
  applicability: "PASS", temporal: "PASS", completeness: "PASS", chainOfCustody: "PASS",
} as const;

test("evidence gate passes only when every dimension passes", () => {
  assert.equal(deriveOverallGateResult(allPass), "PASS");
  assert.equal(deriveOverallGateResult({ ...allPass, temporal: "INSUFFICIENT_EVIDENCE" }), "INSUFFICIENT_EVIDENCE");
  assert.equal(deriveOverallGateResult({ ...allPass, integrity: "FAIL", temporal: "INSUFFICIENT_EVIDENCE" }), "FAIL");
});

test("conclusive test result requires PASS evidence gate", () => {
  assert.doesNotThrow(() => assertConclusiveTestAllowed("PASS", "PASS"));
  assert.throws(() => assertConclusiveTestAllowed("PASS", "INSUFFICIENT_EVIDENCE"));
  assert.throws(() => assertConclusiveTestAllowed("FAIL", null));
  assert.doesNotThrow(() => assertConclusiveTestAllowed("INSUFFICIENT_EVIDENCE", null));
});

test("evidence registration requires provenance and cryptographic digest", () => {
  const valid = validateEvidenceRegistration({
    engagementId: "11111111-1111-4111-8111-111111111111",
    workpaperId: "22222222-2222-4222-8222-222222222222",
    filename: "access-review.csv",
    mimeType: "text/csv",
    sizeBytes: 120,
    storageKey: "org/engagement/evidence/1",
    sha256: "A".repeat(64),
    sourceDescription: "Export supplied by system owner",
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
  });
  assert.equal(valid.sha256, "a".repeat(64));
  assert.throws(() => validateEvidenceRegistration({ ...valid, sha256: "bad" }));
  assert.throws(() => validateEvidenceRegistration({ ...valid, sourceDescription: " " }));
  assert.throws(() => validateEvidenceRegistration({ ...valid, periodStart: "2026-04-01", periodEnd: "2026-03-31" }));
});
