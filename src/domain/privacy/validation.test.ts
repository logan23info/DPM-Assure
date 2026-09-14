import assert from "node:assert/strict";
import test from "node:test";

import {
  PrivacyValidationError,
  validateBreach,
  validateDsr,
  validateProcessingActivity,
  validateTransfer,
} from "./validation";

test("processing activity normalizes core fields", () => {
  const result = validateProcessingActivity({
    name: " Customer support ",
    purpose: " Handle support requests ",
    controllerProcessorRole: "CONTROLLER",
    dataSubjectCategories: [" Customers "],
  });
  assert.equal(result.name, "Customer support");
  assert.equal(result.purpose, "Handle support requests");
  assert.deepEqual(result.dataSubjectCategories, ["Customers"]);
});

test("OTHER transfer mechanism requires a reference", () => {
  assert.throws(
    () => validateTransfer({
      processingActivityId: "92000000-0000-4000-8000-000000000001",
      destinationCountry: "Exampleland",
      mechanism: "OTHER",
    }),
    PrivacyValidationError,
  );
});

test("DSR due date cannot precede receipt", () => {
  assert.throws(
    () => validateDsr({
      requestType: "ACCESS",
      subjectReferenceHash: "a".repeat(64),
      receivedAt: "2026-09-14T10:00:00Z",
      dueAt: "2026-09-13T10:00:00Z",
    }),
    PrivacyValidationError,
  );
});

test("DSR subject references must be lowercase SHA-256 digests", () => {
  assert.throws(
    () => validateDsr({
      requestType: "ACCESS",
      subjectReferenceHash: "X".repeat(64),
      receivedAt: "2026-09-14T10:00:00Z",
    }),
    PrivacyValidationError,
  );
});

test("breach occurrence cannot postdate detection", () => {
  assert.throws(
    () => validateBreach({
      title: "Incident",
      description: "Description",
      detectedAt: "2026-09-14T10:00:00Z",
      occurredAt: "2026-09-15T10:00:00Z",
    }),
    PrivacyValidationError,
  );
});

test("breach notification decision requires rationale", () => {
  assert.throws(
    () => validateBreach({
      title: "Incident",
      description: "Description",
      detectedAt: "2026-09-14T10:00:00Z",
      notificationRequired: false,
    }),
    PrivacyValidationError,
  );
});
