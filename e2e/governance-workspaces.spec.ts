import { createHash } from "node:crypto";
import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:3000";
const ORG = "f1000000-0000-4000-8000-000000000001";
const CLIENT = "f2000000-0000-4000-8000-000000000001";
const RULE = "f3000000-0000-4000-8000-000000000006";
const AI_GENERATION = "f4000000-0000-4000-8000-000000000002";
const NOTIFICATION = "f4000000-0000-4000-8000-000000000001";

const ADMIN_SESSION = "e2e-lifecycle-admin-session-abcdefghijklmnopqrstuvwxyz1234567890";
const SUPER_SESSION = "e2e-governance-super-session-abcdefghijklmnopqrstuvwxyz1234567890";
const REVIEWER_SESSION = "e2e-lifecycle-reviewer-session-abcdefghijklmnopqrstuvwxyz1234567890";

const cookie = (token: string) => `dpm_session=${token}`;

test.describe.configure({ retries: 0 });

async function post(request: APIRequestContext, path: string, token: string, body: unknown, status = 200) {
  const response = await request.post(path, { headers: { cookie: cookie(token), origin: BASE_URL, "sec-fetch-site": "same-origin" }, data: body });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(status);
  return response.json() as Promise<Record<string, any>>;
}

async function get(request: APIRequestContext, path: string, token: string) {
  const response = await request.get(path, { headers: { cookie: cookie(token) } });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(200);
  return response.json() as Promise<Record<string, any>>;
}

async function setSession(context: BrowserContext, token: string) {
  await context.clearCookies();
  await context.addCookies([{ name: "dpm_session", value: token, url: BASE_URL, httpOnly: true, sameSite: "Lax" }]);
}

test("privacy, compliance, AI, notifications and audit history preserve governance boundaries", async ({ request, context, page }) => {
  const privacyPath = `/api/organizations/${ORG}/privacy`;

  const engagement = await post(request, `/api/organizations/${ORG}/engagements`, ADMIN_SESSION, {
    clientId: CLIENT,
    name: "E2E Governance Workspaces",
    description: "Synthetic cross-workspace release verification",
    startDate: "2026-09-27",
  }, 201);

  const activity = await post(request, privacyPath, ADMIN_SESSION, {
    action: "create_activity",
    name: "E2E-PROD-20260924 Customer support processing",
    purpose: "Synthetic lifecycle verification",
    controllerProcessorRole: "CONTROLLER",
    lawfulBasis: "Synthetic contractual necessity",
    dataSubjectCategories: ["Synthetic customers"],
    personalDataCategories: ["Synthetic contact records"],
    recipients: ["Synthetic support team"],
    retentionSummary: "Synthetic 30-day retention",
    securityMeasuresSummary: "Synthetic access controls",
  }, 201);
  const activityId = activity.id as string;

  const selfApproval = await post(request, privacyPath, ADMIN_SESSION, { action: "activate_activity", activityId }, 400);
  expect(selfApproval.message).toMatch(/creator cannot approve/i);
  await post(request, privacyPath, SUPER_SESSION, { action: "activate_activity", activityId, nextReviewAt: "2027-09-27T00:00:00.000Z" });

  const dpia = await post(request, privacyPath, ADMIN_SESSION, {
    action: "create_dpia", processingActivityId: activityId, decision: "IN_PROGRESS",
    screeningRationale: "Synthetic high-risk screening", riskSummary: "Synthetic access risk",
    mitigationSummary: "Synthetic least-privilege mitigation", residualRisk: "LOW",
  }, 201);
  await post(request, privacyPath, SUPER_SESSION, { action: "approve_dpia", dpiaId: dpia.id });

  const processor = await post(request, privacyPath, ADMIN_SESSION, {
    action: "create_processor", name: "E2E-PROD-20260924 Synthetic Processor",
    serviceDescription: "Synthetic hosted support", country: "IN", contractReference: "E2E-CONTRACT-1",
    dpaReference: "E2E-DPA-1", securityReviewStatus: "APPROVED",
  }, 201);
  await post(request, privacyPath, SUPER_SESSION, { action: "activate_processor", processorId: processor.id, nextReviewAt: "2027-09-27T00:00:00.000Z" });

  const transfer = await post(request, privacyPath, ADMIN_SESSION, {
    action: "create_transfer", processingActivityId: activityId, processorId: processor.id,
    destinationCountry: "SG", mechanism: "SCC", mechanismReference: "E2E-SCC-1",
    transferRiskAssessmentReference: "E2E-TRA-1", supplementaryMeasures: "Synthetic encryption controls",
  }, 201);
  await post(request, privacyPath, ADMIN_SESSION, { action: "submit_transfer", transferId: transfer.id });
  await post(request, privacyPath, SUPER_SESSION, { action: "approve_transfer", transferId: transfer.id, nextReviewAt: "2027-09-27T00:00:00.000Z" });

  await post(request, privacyPath, ADMIN_SESSION, {
    action: "create_retention_rule", processingActivityId: activityId, dataCategory: "Synthetic support record",
    retentionPeriod: "30 days", triggerEvent: "Ticket closure", disposalMethod: "Synthetic secure deletion",
    legalBasisReference: "E2E-OFFICIAL-1:E2E-1",
  }, 201);
  const contentHash = createHash("sha256").update("synthetic privacy notice").digest("hex");
  const notice = await post(request, privacyPath, ADMIN_SESSION, {
    action: "register_notice", noticeKey: "E2E-PRIVACY-NOTICE", title: "E2E-PROD-20260924 Privacy Notice",
    contentHash, storageReference: "private://e2e/privacy-notice", effectiveAt: "2026-09-27T00:00:00.000Z",
  }, 201);
  await post(request, privacyPath, SUPER_SESSION, { action: "approve_notice", noticeId: notice.id });
  await post(request, privacyPath, ADMIN_SESSION, {
    action: "record_consent", subjectReferenceHash: createHash("sha256").update("synthetic-subject").digest("hex"),
    purpose: "Synthetic support communication", capturedAt: "2026-09-27T00:00:00.000Z",
    processingActivityId: activityId, noticeId: notice.id,
  }, 201);

  const dsr = await post(request, privacyPath, ADMIN_SESSION, {
    action: "create_dsr", requestType: "ACCESS", subjectReferenceHash: createHash("sha256").update("synthetic-dsr-subject").digest("hex"),
    receivedAt: "2026-09-27T00:00:00.000Z", dueAt: "2026-10-27T00:00:00.000Z",
  }, 201);
  await post(request, privacyPath, ADMIN_SESSION, { action: "transition_dsr", dsrId: dsr.id, status: "IDENTITY_VERIFICATION" });
  await post(request, privacyPath, ADMIN_SESSION, { action: "transition_dsr", dsrId: dsr.id, status: "IN_PROGRESS", identityVerifiedAt: "2026-09-27T01:00:00.000Z" });
  await post(request, privacyPath, ADMIN_SESSION, { action: "transition_dsr", dsrId: dsr.id, status: "COMPLETED", outcome: "Synthetic access response completed" });

  const breach = await post(request, privacyPath, ADMIN_SESSION, {
    action: "create_breach", title: "E2E-PROD-20260924 Synthetic breach", detectedAt: "2026-09-27T00:00:00.000Z",
    description: "Synthetic record for lifecycle verification", dataCategories: ["Synthetic contact records"],
    affectedSubjectsEstimate: 0, severity: "LOW", notificationRequired: false,
    notificationRationale: "Synthetic event is non-notifiable",
  }, 201);
  await post(request, privacyPath, ADMIN_SESSION, { action: "transition_breach", breachId: breach.id, status: "TRIAGE" });
  await post(request, privacyPath, ADMIN_SESSION, { action: "transition_breach", breachId: breach.id, status: "INVESTIGATING" });
  await post(request, privacyPath, ADMIN_SESSION, { action: "transition_breach", breachId: breach.id, status: "CONTAINED", containmentSummary: "Synthetic record isolated" });
  await post(request, privacyPath, ADMIN_SESSION, { action: "transition_breach", breachId: breach.id, status: "NOTIFICATION_ASSESSMENT", notificationRequired: false, notificationRationale: "Synthetic event is non-notifiable" });
  await post(request, privacyPath, ADMIN_SESSION, { action: "transition_breach", breachId: breach.id, status: "CLOSED" });

  const candidate = await post(request, privacyPath, ADMIN_SESSION, {
    action: "propose_assurance_candidate", engagementId: engagement.engagement.id,
    privacyRecordType: "PROCESSING_ACTIVITY", privacyRecordId: activityId, candidateType: "SCOPE",
    suggestedTitle: "E2E-PROD-20260924 Processing activity scope", rationale: "Synthetic record requires assurance coverage",
  }, 201);
  const selfDecision = await post(request, privacyPath, ADMIN_SESSION, { action: "accept_assurance_candidate", candidateId: candidate.id, rationale: "Self decision should be rejected" }, 400);
  expect(selfDecision.message).toMatch(/proposer cannot decide/i);
  await post(request, privacyPath, REVIEWER_SESSION, { action: "accept_assurance_candidate", candidateId: candidate.id, rationale: "Independent synthetic assurance decision" });

  const compliancePath = `/api/organizations/${ORG}/compliance`;
  const profile = await post(request, compliancePath, ADMIN_SESSION, { action: "create_profile", name: "E2E-PROD-20260924 India controller", jurisdiction: "IN" });
  await post(request, compliancePath, ADMIN_SESSION, { action: "set_fact", profileId: profile.result.id, factKey: "ENTITY_ROLE", factValue: "CONTROLLER", sourceReference: "E2E validated organization profile" });
  const determination = await post(request, compliancePath, ADMIN_SESSION, { action: "evaluate_applicability", profileId: profile.result.id, obligationRuleId: RULE });
  expect(determination.result.result).toBe("APPLICABLE");
  const obligation = await post(request, compliancePath, ADMIN_SESSION, { action: "materialize_obligation", determinationId: determination.result.id, triggerAt: "2026-09-27T00:00:00.000Z" });
  expect(obligation.result.status).toBe("OPEN");
  const complianceState = await get(request, compliancePath, ADMIN_SESSION);
  expect(complianceState.profiles.some((item: any) => item.id === profile.result.id)).toBe(true);
  expect(complianceState.determinations.some((item: any) => item.id === determination.result.id && item.result === "APPLICABLE")).toBe(true);

  const aiPath = `/api/organizations/${ORG}/ai`;
  const selfReview = await post(request, aiPath, ADMIN_SESSION, { action: "review", input: { generationId: AI_GENERATION, decision: "APPROVED" } }, 400);
  expect(selfReview.message).toMatch(/creator cannot independently review/i);
  await post(request, aiPath, REVIEWER_SESSION, { action: "review", input: { generationId: AI_GENERATION, decision: "APPROVED" } });
  const published = await post(request, aiPath, REVIEWER_SESSION, { action: "publish", input: { generationId: AI_GENERATION } });
  expect(published.result.status).toBe("PUBLISHED");

  const notificationsPath = `/api/organizations/${ORG}/notifications`;
  const notifications = await get(request, notificationsPath, ADMIN_SESSION);
  expect(notifications.notifications.some((item: any) => item.id === NOTIFICATION && item.status === "UNREAD")).toBe(true);
  await post(request, notificationsPath, ADMIN_SESSION, { action: "mark_read", notificationId: NOTIFICATION });
  const readNotifications = await get(request, notificationsPath, ADMIN_SESSION);
  expect(readNotifications.notifications.find((item: any) => item.id === NOTIFICATION)?.status).toBe("READ");

  await setSession(context, REVIEWER_SESSION);
  await page.goto(`/organizations/${ORG}/audit-log`);
  await expect(page.getByRole("heading", { name: "Audit history" })).toBeVisible();
  await expect(page.getByText("compliance.obligation.materialize", { exact: true })).toBeVisible();
  await expect(page.getByText("ai.publish", { exact: true })).toBeVisible();
  await expect(page.getByText("notification.read", { exact: true })).toBeVisible();

  await setSession(context, ADMIN_SESSION);
  await page.goto(`/organizations/${ORG}/compliance`);
  await expect(page.getByRole("heading", { name: "Compliance profiles", level: 1 })).toBeVisible();
  await expect(page.getByText("E2E-PROD-20260924 India controller", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("APPLICABLE", { exact: true })).toBeVisible();
});
