import assert from "node:assert/strict";
import test from "node:test";

import { membershipRole } from "@/db/schema";
import { hasPermission, permissions, type MembershipRole } from "./rbac";

test("every database membership role is represented by the RBAC policy", () => {
  for (const role of membershipRole.enumValues) {
    assert.doesNotThrow(() =>
      hasPermission(role as MembershipRole, permissions.organizationRead),
    );
  }
});

test("organization admins can manage users", () => {
  assert.equal(
    hasPermission("ORG_ADMIN", permissions.organizationManageUsers),
    true,
  );
});

test("auditors can upload evidence but cannot approve workpapers", () => {
  assert.equal(hasPermission("AUDITOR", permissions.evidenceUpload), true);
  assert.equal(hasPermission("AUDITOR", permissions.workpaperApprove), false);
});

test("reviewers can approve workpapers but cannot create them", () => {
  assert.equal(hasPermission("REVIEWER", permissions.workpaperApprove), true);
  assert.equal(hasPermission("REVIEWER", permissions.workpaperCreate), false);
});

test("client access cannot create findings or approve reports", () => {
  assert.equal(hasPermission("CLIENT", permissions.findingCreate), false);
  assert.equal(hasPermission("CLIENT", permissions.reportApprove), false);
});

test("viewer is read-only across assurance records", () => {
  assert.equal(hasPermission("VIEWER", permissions.engagementRead), true);
  assert.equal(hasPermission("VIEWER", permissions.engagementUpdate), false);
  assert.equal(hasPermission("VIEWER", permissions.evidenceUpload), false);
});
