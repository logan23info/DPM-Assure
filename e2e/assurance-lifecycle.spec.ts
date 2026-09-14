import { createHash } from "node:crypto";
import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

const BASE_URL = "http://127.0.0.1:3000";
const ORG = "f1000000-0000-4000-8000-000000000001";
const CLIENT = "f2000000-0000-4000-8000-000000000001";
const MANAGER_USER = "f1000000-0000-4000-8000-000000000014";
const REVIEWER_USER = "f1000000-0000-4000-8000-000000000015";
const CLIENT_USER = "f1000000-0000-4000-8000-000000000016";
const FRAMEWORK_VERSION = "f3000000-0000-4000-8000-000000000003";
const REQUIREMENT = "f3000000-0000-4000-8000-000000000004";
const CONTROL = "f3000000-0000-4000-8000-000000000005";

const ADMIN_SESSION = "e2e-lifecycle-admin-session-abcdefghijklmnopqrstuvwxyz1234567890";
const REVIEWER_SESSION = "e2e-lifecycle-reviewer-session-abcdefghijklmnopqrstuvwxyz1234567890";
const CLIENT_SESSION = "e2e-lifecycle-client-session-abcdefghijklmnopqrstuvwxyz1234567890";

const cookie = (token: string) => `dpm_session=${token}`;

async function postJson(
  request: APIRequestContext,
  path: string,
  token: string,
  body: unknown,
  expectedStatus = 200,
) {
  const response = await request.post(path, {
    headers: {
      cookie: cookie(token),
      origin: BASE_URL,
      "sec-fetch-site": "same-origin",
    },
    data: body,
    maxRedirects: 0,
  });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(expectedStatus);
  return response.json() as Promise<Record<string, any>>;
}

async function getJson(
  request: APIRequestContext,
  path: string,
  token: string,
  expectedStatus = 200,
) {
  const response = await request.get(path, {
    headers: { cookie: cookie(token) },
    maxRedirects: 0,
  });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(expectedStatus);
  return response.json() as Promise<Record<string, any>>;
}

async function setSession(context: BrowserContext, token: string) {
  await context.addCookies([
    {
      name: "dpm_session",
      value: token,
      url: BASE_URL,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

test("source-backed engagement flows through PBC evidence, gate, review, close and immutable freeze", async ({ request, context, page }) => {
  const engagementsPath = `/api/organizations/${ORG}/engagements`;
  const created = await postJson(request, engagementsPath, ADMIN_SESSION, {
    clientId: CLIENT,
    name: "E2E Governed Assurance Engagement",
    description: "Production-equivalent lifecycle release gate",
    startDate: "2026-09-14",
  }, 201);
  const engagementId = created.engagement.id as string;
  expect(engagementId).toMatch(/^[0-9a-f-]{36}$/i);

  const governancePath = `${engagementId}/governance`;
  const engagementApiRoot = `/api/organizations/${ORG}/engagements/${engagementId}`;

  await postJson(request, `${engagementApiRoot}/scope`, ADMIN_SESSION, {
    action: "select_framework",
    frameworkVersionId: FRAMEWORK_VERSION,
  });

  const scope = await postJson(request, `${engagementApiRoot}/scope`, ADMIN_SESSION, {
    action: "define_scope",
    name: "Primary application boundary",
    description: "Application, supporting process and evidence boundary",
    scopeType: "APPLICATION",
    inScope: true,
    rationale: "Required for assurance coverage",
  });
  expect(scope.result.id).toMatch(/^[0-9a-f-]{36}$/i);

  const applicability = await postJson(request, `${engagementApiRoot}/scope`, ADMIN_SESSION, {
    action: "decide_applicability",
    requirementId: REQUIREMENT,
    decision: "APPLICABLE",
    rationale: "Requirement applies to the in-scope application",
  });
  const applicabilityId = applicability.result.id as string;

  for (const [userId, assignmentRole] of [
    [MANAGER_USER, "AUDIT_MANAGER"],
    [REVIEWER_USER, "REVIEWER"],
  ] as const) {
    await postJson(request, `${engagementApiRoot}/governance`, ADMIN_SESSION, {
      action: "assign_user",
      userId,
      assignmentRole,
    });
    await postJson(request, `${engagementApiRoot}/governance`, ADMIN_SESSION, {
      action: "record_independence",
      subjectUserId: userId,
      result: "CLEAR",
    });
  }

  await postJson(request, `${engagementApiRoot}/governance`, ADMIN_SESSION, {
    action: "record_risk",
    methodVersion: "E2E-PRELIMINARY-1",
    inherentScore: 8,
    controlScore: 4,
    residualScore: 4,
    rationale: "Deterministic preliminary risk assessment for release verification",
  });

  const plan = await postJson(request, `${engagementApiRoot}/governance`, ADMIN_SESSION, {
    action: "create_plan",
    objectives: "Test the source-backed privacy control and supporting evidence",
    scopeSummary: "One framework requirement and one application boundary",
    samplingApproach: "Judgmental evidence sample for E2E verification",
  });
  const planId = plan.result.id as string;

  await postJson(request, `${engagementApiRoot}/governance`, REVIEWER_SESSION, {
    action: "approve_plan",
    auditPlanId: planId,
  });

  await postJson(request, `${engagementApiRoot}/governance`, ADMIN_SESSION, {
    action: "start_testing",
  });

  await setSession(context, ADMIN_SESSION);
  await page.goto(`/organizations/${ORG}/engagements/${engagementId}`);
  await expect(page.getByRole("heading", { name: "E2E Governed Assurance Engagement" })).toBeVisible();
  await expect(page.getByText("TESTING", { exact: true })).toBeVisible();

  const executionPath = `${engagementApiRoot}/execution`;
  const workpaper = await postJson(request, executionPath, ADMIN_SESSION, {
    action: "create_workpaper",
    input: {
      title: "Evidence integrity workpaper",
      controlId: CONTROL,
    },
  });
  const workpaperId = workpaper.result.id as string;

  await postJson(request, executionPath, ADMIN_SESSION, {
    action: "link_workpaper_requirement",
    input: {
      workpaperId,
      applicabilityId,
      requirementId: REQUIREMENT,
      controlId: CONTROL,
    },
  });

  const procedure = await postJson(request, executionPath, ADMIN_SESSION, {
    action: "create_procedure",
    input: {
      workpaperId,
      name: "Inspect evidence provenance and integrity",
      description: "Obtain client evidence, verify provenance and evaluate all evidence-gate dimensions",
      procedureType: "INSPECTION",
      sequence: 1,
      expectedResult: "Evidence passes the deterministic gate",
    },
  });
  const procedureId = procedure.result.id as string;

  await postJson(request, executionPath, ADMIN_SESSION, {
    action: "define_procedure_execution",
    input: {
      procedureId,
      requirementId: REQUIREMENT,
      testObjective: "Establish that submitted evidence is reliable and applicable",
      expectedEvidence: "Client-supplied text evidence with verified custody and hash",
      testMethod: "Inspect source, custody, SHA-256 and period applicability",
    },
  });

  const pbc = await postJson(request, executionPath, ADMIN_SESSION, {
    action: "create_pbc",
    input: {
      workpaperId,
      procedureId,
      requirementId: REQUIREMENT,
      title: "Provide control-operation evidence",
      description: "Provide the source artifact used to support this procedure",
      expectedEvidence: "Text evidence showing the control operated during the review period",
      dueAt: "2026-09-30T00:00:00.000Z",
    },
  });
  const pbcRequestId = pbc.result.id as string;

  await postJson(request, `/api/organizations/${ORG}/client-access`, ADMIN_SESSION, {
    action: "grant",
    clientId: CLIENT,
    userId: CLIENT_USER,
  });
  await postJson(request, `/api/organizations/${ORG}/client-access`, ADMIN_SESSION, {
    action: "assign_pbc",
    pbcRequestId,
    userId: CLIENT_USER,
  });

  const clientPortal = await getJson(request, `/api/organizations/${ORG}/client-portal`, CLIENT_SESSION);
  expect(clientPortal.requests.some((item: any) => item.id === pbcRequestId)).toBe(true);

  await postJson(request, `/api/organizations/${ORG}/client-portal`, CLIENT_SESSION, {
    pbcRequestId,
    responseText: "Evidence attached through the governed private upload flow.",
  });

  const evidenceBytes = Buffer.from("DPM-Assure E2E evidence: source-backed control operated as designed.\n", "utf8");
  const expectedHash = createHash("sha256").update(evidenceBytes).digest("hex");

  const uploadIntent = await postJson(request, `/api/organizations/${ORG}/client-portal`, CLIENT_SESSION, {
    action: "create_evidence_upload_intent",
    input: {
      pbcRequestId,
      filename: "control-evidence.txt",
      mimeType: "text/plain",
      sizeBytes: evidenceBytes.byteLength,
    },
  });

  const upload = await request.put(uploadIntent.result.uploadUrl, {
    headers: uploadIntent.result.requiredHeaders,
    data: evidenceBytes,
  });
  expect(upload.status()).toBeGreaterThanOrEqual(200);
  expect(upload.status()).toBeLessThan(300);

  const finalized = await postJson(request, `/api/organizations/${ORG}/client-portal`, CLIENT_SESSION, {
    action: "finalize_evidence_upload",
    input: {
      intentId: uploadIntent.result.intentId,
      sourceDescription: "Submitted by the assigned client user from the source system export",
      acquiredAt: "2026-09-14T00:00:00.000Z",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-14",
    },
  });
  const evidenceId = finalized.result.evidenceId as string;
  expect(finalized.result.sha256).toBe(expectedHash);

  const download = await postJson(request, `${engagementApiRoot}/evidence/storage`, ADMIN_SESSION, {
    action: "create_download",
    input: { evidenceId },
  });
  const downloaded = await request.get(download.result.url);
  expect(downloaded.status()).toBe(200);
  expect(Buffer.from(await downloaded.body())).toEqual(evidenceBytes);

  const rejectedWithoutGate = await request.post(`${engagementApiRoot}/evidence`, {
    headers: {
      cookie: cookie(ADMIN_SESSION),
      origin: BASE_URL,
      "sec-fetch-site": "same-origin",
    },
    data: {
      action: "recordTestResult",
      workpaperId,
      procedureId,
      result: "PASS",
      conclusion: "This must not be accepted before the Evidence Gate passes",
    },
  });
  expect(rejectedWithoutGate.status()).toBe(400);
  await expect(rejectedWithoutGate.json()).resolves.toMatchObject({ error: "EVIDENCE_ACTION_REJECTED" });

  const gate = await postJson(request, `${engagementApiRoot}/evidence`, REVIEWER_SESSION, {
    action: "evaluateGate",
    evidenceId,
    procedureId,
    gateVersion: "EVIDENCE-GATE-1",
    dimensions: {
      identity: "PASS",
      provenance: "PASS",
      integrity: "PASS",
      authorization: "PASS",
      applicability: "PASS",
      temporal: "PASS",
      completeness: "PASS",
      chainOfCustody: "PASS",
    },
    rationale: "All eight deterministic dimensions are supported by the submitted artifact and custody record",
  });
  expect(gate.result.overall).toBe("PASS");

  const testResult = await postJson(request, `${engagementApiRoot}/evidence`, ADMIN_SESSION, {
    action: "recordTestResult",
    workpaperId,
    procedureId,
    evidenceGateResultId: gate.result.id,
    result: "PASS",
    conclusion: "Procedure passed on evidence that satisfied the Evidence Gate",
  });
  expect(testResult.result.id).toMatch(/^[0-9a-f-]{36}$/i);

  const completedPbc = await postJson(request, executionPath, ADMIN_SESSION, {
    action: "complete_pbc",
    input: { pbcRequestId },
  });
  expect(completedPbc.result.status).toBe("COMPLETED");
  expect(completedPbc.result.fulfilledBy).toBe(CLIENT_USER);

  const finalizationPath = `${engagementApiRoot}/finalization`;
  await postJson(request, finalizationPath, ADMIN_SESSION, { action: "enter_review" });

  await postJson(request, finalizationPath, REVIEWER_SESSION, {
    action: "review_workpaper",
    workpaperId,
    status: "APPROVED",
    comments: "Workpaper contains source-linked procedure, evidence, gate result and test conclusion",
  });

  await postJson(request, finalizationPath, REVIEWER_SESSION, {
    action: "signoff",
    statement: "I independently reviewed the assurance work and approve the final conclusion.",
  });

  const report = await postJson(request, finalizationPath, ADMIN_SESSION, {
    action: "generate_report",
    reportType: "FINAL_ASSURANCE",
    summary: "E2E assurance report generated from governed workpaper and evidence state",
  });

  await postJson(request, finalizationPath, REVIEWER_SESSION, {
    action: "approve_report",
    reportId: report.result.id,
  });

  const closed = await postJson(request, finalizationPath, ADMIN_SESSION, {
    action: "close_engagement",
  });
  expect(closed.result.status).toBe("CLOSED");

  const frozen = await postJson(request, finalizationPath, ADMIN_SESSION, {
    action: "freeze_engagement",
    freezeReason: "Release E2E confirms the final assurance record is immutable",
  });
  expect(frozen.result.snapshotHash).toMatch(/^[0-9a-f]{64}$/);

  const postFreezeMutation = await request.post(finalizationPath, {
    headers: {
      cookie: cookie(REVIEWER_SESSION),
      origin: BASE_URL,
      "sec-fetch-site": "same-origin",
    },
    data: {
      action: "review_workpaper",
      workpaperId,
      status: "APPROVED",
      comments: "This mutation must be rejected after freeze",
    },
  });
  expect(postFreezeMutation.status()).toBe(400);
  const postFreezeBody = await postFreezeMutation.json();
  expect(postFreezeBody.error).toBe("FINALIZATION_REJECTED");
  expect(String(postFreezeBody.message)).toMatch(/Frozen engagement/i);

  await page.goto(`/organizations/${ORG}/engagements/${engagementId}`);
  await expect(page.getByRole("heading", { name: "E2E Governed Assurance Engagement" })).toBeVisible();
  await expect(page.getByText("CLOSED", { exact: true })).toBeVisible();
});
