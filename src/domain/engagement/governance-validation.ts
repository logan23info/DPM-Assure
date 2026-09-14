export type AssuranceAssignmentRole =
  | "AUDIT_MANAGER"
  | "LEAD_AUDITOR"
  | "AUDITOR"
  | "REVIEWER";

export type IndependenceResult = "CLEAR" | "CONFLICT";

export interface AssignEngagementUserInput {
  readonly engagementId: string;
  readonly userId: string;
  readonly assignmentRole: AssuranceAssignmentRole;
}

export interface RecordIndependenceCheckInput {
  readonly engagementId: string;
  readonly subjectUserId: string;
  readonly result: IndependenceResult;
  readonly conflictDetails?: string | null;
}

export interface ResolveIndependenceConflictInput {
  readonly independenceCheckId: string;
}

export interface RecordRiskAssessmentInput {
  readonly engagementId: string;
  readonly methodVersion: string;
  readonly inherentScore?: number | null;
  readonly controlScore?: number | null;
  readonly residualScore?: number | null;
  readonly rationale: string;
}

export interface CreateAuditPlanInput {
  readonly engagementId: string;
  readonly objectives: string;
  readonly scopeSummary: string;
  readonly samplingApproach?: string | null;
}

export interface ApproveAuditPlanInput {
  readonly auditPlanId: string;
}

export interface StartTestingInput {
  readonly engagementId: string;
}

export class EngagementGovernanceValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid engagement governance input: ${issues.join("; ")}`);
    this.name = "EngagementGovernanceValidationError";
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assignmentRoles = new Set<AssuranceAssignmentRole>([
  "AUDIT_MANAGER",
  "LEAD_AUDITOR",
  "AUDITOR",
  "REVIEWER",
]);

function requiredText(
  value: string,
  name: string,
  issues: string[],
  maxLength: number,
): string {
  const normalized = value.trim();
  if (normalized.length === 0) issues.push(`${name} is required`);
  if (normalized.length > maxLength) {
    issues.push(`${name} must not exceed ${maxLength} characters`);
  }
  return normalized;
}

function optionalText(
  value: string | null | undefined,
  name: string,
  issues: string[],
  maxLength: number,
): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > maxLength) {
    issues.push(`${name} must not exceed ${maxLength} characters`);
  }
  return normalized;
}

function validateUuid(value: string, name: string, issues: string[]): void {
  if (!uuidPattern.test(value)) issues.push(`${name} must be a UUID`);
}

function validateScore(
  value: number | null | undefined,
  name: string,
  issues: string[],
): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) {
    issues.push(`${name} must be a finite non-negative number`);
  }
  return value;
}

export function validateAssignmentInput(input: AssignEngagementUserInput) {
  const issues: string[] = [];
  validateUuid(input.engagementId, "engagementId", issues);
  validateUuid(input.userId, "userId", issues);
  if (!assignmentRoles.has(input.assignmentRole)) {
    issues.push("assignmentRole must be an assurance role");
  }
  if (issues.length > 0) throw new EngagementGovernanceValidationError(issues);
  return { ...input };
}

export function validateIndependenceCheckInput(
  input: RecordIndependenceCheckInput,
) {
  const issues: string[] = [];
  validateUuid(input.engagementId, "engagementId", issues);
  validateUuid(input.subjectUserId, "subjectUserId", issues);
  const conflictDetails = optionalText(
    input.conflictDetails,
    "conflictDetails",
    issues,
    10_000,
  );
  if (input.result !== "CLEAR" && input.result !== "CONFLICT") {
    issues.push("result must be CLEAR or CONFLICT");
  }
  if (input.result === "CONFLICT" && !conflictDetails) {
    issues.push("conflictDetails is required when result is CONFLICT");
  }
  if (input.result === "CLEAR" && conflictDetails) {
    issues.push("conflictDetails must be empty when result is CLEAR");
  }
  if (issues.length > 0) throw new EngagementGovernanceValidationError(issues);
  return { ...input, conflictDetails };
}

export function validateRiskAssessmentInput(input: RecordRiskAssessmentInput) {
  const issues: string[] = [];
  validateUuid(input.engagementId, "engagementId", issues);
  const methodVersion = requiredText(input.methodVersion, "methodVersion", issues, 100);
  const rationale = requiredText(input.rationale, "rationale", issues, 10_000);
  const inherentScore = validateScore(input.inherentScore, "inherentScore", issues);
  const controlScore = validateScore(input.controlScore, "controlScore", issues);
  const residualScore = validateScore(input.residualScore, "residualScore", issues);
  if (issues.length > 0) throw new EngagementGovernanceValidationError(issues);
  return {
    engagementId: input.engagementId,
    methodVersion,
    rationale,
    inherentScore,
    controlScore,
    residualScore,
  };
}

export function validateCreateAuditPlanInput(input: CreateAuditPlanInput) {
  const issues: string[] = [];
  validateUuid(input.engagementId, "engagementId", issues);
  const objectives = requiredText(input.objectives, "objectives", issues, 20_000);
  const scopeSummary = requiredText(input.scopeSummary, "scopeSummary", issues, 20_000);
  const samplingApproach = optionalText(
    input.samplingApproach,
    "samplingApproach",
    issues,
    20_000,
  );
  if (issues.length > 0) throw new EngagementGovernanceValidationError(issues);
  return {
    engagementId: input.engagementId,
    objectives,
    scopeSummary,
    samplingApproach,
  };
}

export function validateEntityId(id: string, name: string): string {
  const issues: string[] = [];
  validateUuid(id, name, issues);
  if (issues.length > 0) throw new EngagementGovernanceValidationError(issues);
  return id;
}
