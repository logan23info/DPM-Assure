import assert from "node:assert/strict";
import test from "node:test";

import { membershipRole } from "@/db/schema";
import { hasPermission, permissions, type MembershipRole } from "./rbac";

test("every database membership role is represented by the RBAC policy", () => {
  for (const role of membershipRole.enumValues) assert.doesNotThrow(() => hasPermission(role as MembershipRole, permissions.organizationRead));
});
test("organization admins can manage users", () => assert.equal(hasPermission("ORG_ADMIN", permissions.organizationManageUsers), true));
test("auditors can upload evidence but cannot approve workpapers", () => { assert.equal(hasPermission("AUDITOR", permissions.evidenceUpload), true); assert.equal(hasPermission("AUDITOR", permissions.workpaperApprove), false); });
test("reviewers can approve workpapers but cannot create them", () => { assert.equal(hasPermission("REVIEWER", permissions.workpaperApprove), true); assert.equal(hasPermission("REVIEWER", permissions.workpaperCreate), false); });
test("final assurance permissions preserve segregation of duties", () => {
  assert.equal(hasPermission("AUDIT_MANAGER", permissions.engagementSignoff), true);
  assert.equal(hasPermission("AUDIT_MANAGER", permissions.engagementFreeze), true);
  assert.equal(hasPermission("REVIEWER", permissions.engagementSignoff), true);
  assert.equal(hasPermission("REVIEWER", permissions.engagementFreeze), false);
  assert.equal(hasPermission("LEAD_AUDITOR", permissions.engagementSignoff), false);
  assert.equal(hasPermission("AUDITOR", permissions.engagementSignoff), false);
});
test("privacy operations mutations are restricted to organization administration", () => {
  assert.equal(hasPermission("ORG_ADMIN", permissions.privacyManage), true);
  assert.equal(hasPermission("ORG_ADMIN", permissions.privacyApprove), true);
  assert.equal(hasPermission("ORG_ADMIN", permissions.privacyDsrManage), true);
  assert.equal(hasPermission("ORG_ADMIN", permissions.privacyBreachManage), true);
  assert.equal(hasPermission("ORG_ADMIN", permissions.privacyAlertsManage), true);
  assert.equal(hasPermission("AUDIT_MANAGER", permissions.privacyManage), false);
  assert.equal(hasPermission("AUDITOR", permissions.privacyManage), false);
  assert.equal(hasPermission("AUDITOR", permissions.privacyAlertsManage), false);
  assert.equal(hasPermission("REVIEWER", permissions.privacyApprove), false);
});
test("assurance roles may read privacy operations without mutating them", () => {
  assert.equal(hasPermission("AUDIT_MANAGER", permissions.privacyRead), true);
  assert.equal(hasPermission("LEAD_AUDITOR", permissions.privacyRead), true);
  assert.equal(hasPermission("AUDITOR", permissions.privacyRead), true);
  assert.equal(hasPermission("REVIEWER", permissions.privacyRead), true);
});
test("privacy assurance bridge separates proposal from decision authority", () => {
  assert.equal(hasPermission("AUDITOR", permissions.privacyAssurancePropose), true);
  assert.equal(hasPermission("AUDITOR", permissions.privacyAssuranceDecide), false);
  assert.equal(hasPermission("LEAD_AUDITOR", permissions.privacyAssurancePropose), true);
  assert.equal(hasPermission("LEAD_AUDITOR", permissions.privacyAssuranceDecide), false);
  assert.equal(hasPermission("REVIEWER", permissions.privacyAssurancePropose), false);
  assert.equal(hasPermission("REVIEWER", permissions.privacyAssuranceDecide), true);
  assert.equal(hasPermission("AUDIT_MANAGER", permissions.privacyAssurancePropose), true);
  assert.equal(hasPermission("AUDIT_MANAGER", permissions.privacyAssuranceDecide), true);
  assert.equal(hasPermission("CLIENT", permissions.privacyAssurancePropose), false);
  assert.equal(hasPermission("CLIENT", permissions.privacyAssuranceDecide), false);
});
test("client portal is least privilege and cannot read internal assurance records", () => {
  assert.equal(hasPermission("CLIENT", permissions.organizationRead), true);
  assert.equal(hasPermission("CLIENT", permissions.clientPortalRead), true);
  assert.equal(hasPermission("CLIENT", permissions.clientPbcRespond), true);
  assert.equal(hasPermission("CLIENT", permissions.engagementRead), false);
  assert.equal(hasPermission("CLIENT", permissions.workpaperRead), false);
  assert.equal(hasPermission("CLIENT", permissions.evidenceRead), false);
  assert.equal(hasPermission("CLIENT", permissions.evidenceUpload), false);
  assert.equal(hasPermission("CLIENT", permissions.findingRead), false);
  assert.equal(hasPermission("CLIENT", permissions.reportRead), false);
  assert.equal(hasPermission("CLIENT", permissions.findingCreate), false);
  assert.equal(hasPermission("CLIENT", permissions.reportApprove), false);
  assert.equal(hasPermission("CLIENT", permissions.engagementFreeze), false);
  assert.equal(hasPermission("CLIENT", permissions.privacyRead), false);
});
test("viewer is read-only across assurance records", () => {
  assert.equal(hasPermission("VIEWER", permissions.engagementRead), true);
  assert.equal(hasPermission("VIEWER", permissions.engagementUpdate), false);
  assert.equal(hasPermission("VIEWER", permissions.evidenceUpload), false);
  assert.equal(hasPermission("VIEWER", permissions.engagementSignoff), false);
  assert.equal(hasPermission("VIEWER", permissions.privacyRead), false);
});
