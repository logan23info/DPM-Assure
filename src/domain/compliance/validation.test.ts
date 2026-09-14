import assert from "node:assert/strict";
import test from "node:test";

import {
  validateComplianceFact,
  validateCreateComplianceProfile,
  validateMaterializeObligation,
} from "./validation";

test("compliance profiles require a jurisdiction", () => {
  assert.throws(() => validateCreateComplianceProfile({ name: "Primary", jurisdiction: "   " }));
});

test("compliance facts normalize deterministic identifiers", () => {
  const value = validateComplianceFact({
    profileId: "profile",
    factKey: "entity_role",
    factValue: "CONTROLLER",
    sourceReference: "Validated onboarding record",
  });
  assert.equal(value.factKey, "ENTITY_ROLE");
});

test("malformed fact identifiers and incomplete privacy links fail closed", () => {
  assert.throws(() => validateComplianceFact({
    profileId: "profile",
    factKey: "bad key",
    factValue: "value",
    sourceReference: "source",
  }));
  assert.throws(() => validateMaterializeObligation({
    determinationId: "determination",
    triggerAt: new Date("2026-09-01T00:00:00Z"),
    privacyRecordType: "BREACH",
  }));
});
