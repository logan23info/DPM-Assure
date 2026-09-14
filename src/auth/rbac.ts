import { membershipRole } from "@/db/schema";

export type MembershipRole = (typeof membershipRole.enumValues)[number];

export const permissions = {
  organizationRead: "organization.read",
  organizationManageUsers: "organization.manage_users",
  organizationManageSettings: "organization.manage_settings",
  clientPortalRead: "client_portal.read",
  clientPbcRespond: "client_portal.pbc.respond",
  engagementRead: "engagement.read",
  engagementCreate: "engagement.create",
  engagementUpdate: "engagement.update",
  engagementClose: "engagement.close",
  engagementGovernanceManage: "engagement.governance.manage",
  engagementPlanApprove: "engagement.plan.approve",
  engagementStartTesting: "engagement.start_testing",
  engagementSignoff: "engagement.signoff",
  engagementFreeze: "engagement.freeze",
  workpaperRead: "workpaper.read",
  workpaperCreate: "workpaper.create",
  workpaperUpdate: "workpaper.update",
  workpaperReview: "workpaper.review",
  workpaperApprove: "workpaper.approve",
  evidenceRead: "evidence.read",
  evidenceUpload: "evidence.upload",
  evidenceDelete: "evidence.delete",
  findingRead: "finding.read",
  findingCreate: "finding.create",
  findingUpdate: "finding.update",
  findingClose: "finding.close",
  reportRead: "report.read",
  reportGenerate: "report.generate",
  reportExport: "report.export",
  reportApprove: "report.approve",
  privacyRead: "privacy.read",
  privacyManage: "privacy.manage",
  privacyApprove: "privacy.approve",
  privacyDsrManage: "privacy.dsr.manage",
  privacyBreachManage: "privacy.breach.manage",
  privacyAlertsManage: "privacy.alerts.manage",
  privacyAssurancePropose: "privacy.assurance.propose",
  privacyAssuranceDecide: "privacy.assurance.decide",
  complianceRead: "compliance.read",
  complianceProfileManage: "compliance.profile.manage",
  complianceApplicabilityEvaluate: "compliance.applicability.evaluate",
  complianceObligationMaterialize: "compliance.obligation.materialize",
  complianceMonitoringManage: "compliance.monitoring.manage",
  auditLogRead: "audit_log.read",
  aiUse: "ai.use",
  aiReview: "ai.review",
  aiPublish: "ai.publish",
} as const;

export type Permission = (typeof permissions)[keyof typeof permissions];
const allPermissions = Object.freeze(new Set<Permission>(Object.values(permissions)));

const rolePermissions: Readonly<Record<MembershipRole, ReadonlySet<Permission>>> = {
  SUPER_ADMIN: allPermissions,
  ORG_ADMIN: allPermissions,
  AUDIT_MANAGER: new Set([
    permissions.organizationRead, permissions.engagementRead, permissions.engagementCreate,
    permissions.engagementUpdate, permissions.engagementClose, permissions.engagementGovernanceManage,
    permissions.engagementPlanApprove, permissions.engagementStartTesting, permissions.engagementSignoff,
    permissions.engagementFreeze, permissions.workpaperRead, permissions.workpaperCreate,
    permissions.workpaperUpdate, permissions.workpaperReview, permissions.workpaperApprove,
    permissions.evidenceRead, permissions.evidenceUpload, permissions.evidenceDelete,
    permissions.findingRead, permissions.findingCreate, permissions.findingUpdate, permissions.findingClose,
    permissions.reportRead, permissions.reportGenerate, permissions.reportExport, permissions.reportApprove,
    permissions.privacyRead, permissions.privacyAssurancePropose, permissions.privacyAssuranceDecide,
    permissions.complianceRead, permissions.auditLogRead, permissions.aiUse, permissions.aiReview,
    permissions.aiPublish,
  ]),
  LEAD_AUDITOR: new Set([
    permissions.organizationRead, permissions.engagementRead, permissions.engagementUpdate,
    permissions.engagementGovernanceManage, permissions.workpaperRead, permissions.workpaperCreate,
    permissions.workpaperUpdate, permissions.workpaperReview, permissions.evidenceRead,
    permissions.evidenceUpload, permissions.findingRead, permissions.findingCreate,
    permissions.findingUpdate, permissions.reportRead, permissions.reportGenerate,
    permissions.reportExport, permissions.privacyRead, permissions.privacyAssurancePropose,
    permissions.complianceRead, permissions.aiUse, permissions.aiReview,
  ]),
  AUDITOR: new Set([
    permissions.organizationRead, permissions.engagementRead, permissions.workpaperRead,
    permissions.workpaperCreate, permissions.workpaperUpdate, permissions.evidenceRead,
    permissions.evidenceUpload, permissions.findingRead, permissions.findingCreate,
    permissions.findingUpdate, permissions.reportRead, permissions.privacyRead,
    permissions.privacyAssurancePropose, permissions.complianceRead, permissions.aiUse,
  ]),
  REVIEWER: new Set([
    permissions.organizationRead, permissions.engagementRead, permissions.engagementPlanApprove,
    permissions.engagementSignoff, permissions.workpaperRead, permissions.workpaperReview,
    permissions.workpaperApprove, permissions.evidenceRead, permissions.findingRead,
    permissions.findingUpdate, permissions.reportRead, permissions.reportApprove,
    permissions.privacyRead, permissions.privacyAssuranceDecide, permissions.complianceRead,
    permissions.auditLogRead, permissions.aiUse, permissions.aiReview, permissions.aiPublish,
  ]),
  CLIENT: new Set([
    permissions.organizationRead,
    permissions.clientPortalRead,
    permissions.clientPbcRespond,
  ]),
  VIEWER: new Set([
    permissions.organizationRead, permissions.engagementRead, permissions.workpaperRead,
    permissions.evidenceRead, permissions.findingRead, permissions.reportRead,
  ]),
};

export class AuthorizationDeniedError extends Error {
  constructor(readonly role: MembershipRole, readonly permission: Permission) {
    super(`Role ${role} is not authorized for ${permission}`);
    this.name = "AuthorizationDeniedError";
  }
}
export function hasPermission(role: MembershipRole, permission: Permission): boolean { return rolePermissions[role].has(permission); }
export function requirePermission(role: MembershipRole, permission: Permission): void { if (!hasPermission(role, permission)) throw new AuthorizationDeniedError(role, permission); }
