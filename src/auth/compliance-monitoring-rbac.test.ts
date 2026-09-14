import assert from "node:assert/strict";
import test from "node:test";

import { hasPermission, permissions } from "./rbac";

test("organization administrators can manage compliance monitoring", () => {
  assert.equal(hasPermission("ORG_ADMIN", permissions.complianceMonitoringManage), true);
  assert.equal(hasPermission("SUPER_ADMIN", permissions.complianceMonitoringManage), true);
});

test("assurance roles can inspect compliance state but cannot mutate monitoring workflow", () => {
  for (const role of ["AUDIT_MANAGER", "LEAD_AUDITOR", "AUDITOR", "REVIEWER"] as const) {
    assert.equal(hasPermission(role, permissions.complianceRead), true);
    assert.equal(hasPermission(role, permissions.complianceMonitoringManage), false);
  }
});

test("client and viewer roles cannot access compliance monitoring", () => {
  for (const role of ["CLIENT", "VIEWER"] as const) {
    assert.equal(hasPermission(role, permissions.complianceRead), false);
    assert.equal(hasPermission(role, permissions.complianceMonitoringManage), false);
  }
});
