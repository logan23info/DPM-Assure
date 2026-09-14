import assert from "node:assert/strict";
import test from "node:test";

import { hasPermission, permissions, type MembershipRole } from "./rbac";

const roles: MembershipRole[] = [
  "SUPER_ADMIN","ORG_ADMIN","AUDIT_MANAGER","LEAD_AUDITOR","AUDITOR","REVIEWER","CLIENT","VIEWER",
];

test("only organization administrators can manage organization users", () => {
  for (const role of roles) {
    const expected = role === "SUPER_ADMIN" || role === "ORG_ADMIN";
    assert.equal(hasPermission(role, permissions.organizationManageUsers), expected, role);
  }
});
