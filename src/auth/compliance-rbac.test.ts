import assert from "node:assert/strict";
import test from "node:test";

import { hasPermission, permissions } from "./rbac";

test("organization administration owns compliance profile execution", () => {
  assert.equal(hasPermission("ORG_ADMIN", permissions.complianceRead), true);
  assert.equal(hasPermission("ORG_ADMIN", permissions.complianceProfileManage), true);
  assert.equal(hasPermission("ORG_ADMIN", permissions.complianceApplicabilityEvaluate), true);
  assert.equal(hasPermission("ORG_ADMIN", permissions.complianceObligationMaterialize), true);
});

test("assurance roles inspect compliance determinations but cannot mutate organization profiles", () => {
  for (const role of ["AUDIT_MANAGER", "LEAD_AUDITOR", "AUDITOR", "REVIEWER"] as const) {
    assert.equal(hasPermission(role, permissions.complianceRead), true);
    assert.equal(hasPermission(role, permissions.complianceProfileManage), false);
    assert.equal(hasPermission(role, permissions.complianceApplicabilityEvaluate), false);
    assert.equal(hasPermission(role, permissions.complianceObligationMaterialize), false);
  }
});

test("client and viewer roles have no compliance applicability access", () => {
  assert.equal(hasPermission("CLIENT", permissions.complianceRead), false);
  assert.equal(hasPermission("VIEWER", permissions.complianceRead), false);
});
