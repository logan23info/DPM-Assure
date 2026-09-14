export type SampleReviewDecision = "APPROVED" | "REJECTED";

export interface CreateSampleInput {
  readonly engagementId: string;
  readonly requirementId?: string | null;
  readonly scopeId?: string | null;
  readonly populationDescription: string;
  readonly populationSize?: number | null;
  readonly samplingMethod: string;
  readonly sampleSize?: number | null;
  readonly selectionBasis: string;
}

export interface AddSampleItemInput {
  readonly sampleId: string;
  readonly itemKey: string;
  readonly itemSnapshot?: Readonly<Record<string, unknown>>;
  readonly selectionReason: string;
}

export interface ReviewSampleInput {
  readonly sampleId: string;
  readonly decision: SampleReviewDecision;
  readonly rationale: string;
}

export interface LinkWorkpaperRequirementInput {
  readonly workpaperId: string;
  readonly applicabilityId: string;
  readonly requirementId: string;
  readonly controlId?: string | null;
}

export interface LinkWorkpaperSampleInput {
  readonly workpaperId: string;
  readonly sampleId: string;
}

export interface DefineProcedureExecutionInput {
  readonly procedureId: string;
  readonly requirementId: string;
  readonly testObjective: string;
  readonly expectedEvidence: string;
  readonly testMethod: string;
}

export class ExecutionValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid execution input: ${issues.join("; ")}`);
    this.name = "ExecutionValidationError";
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateUuid(value: string, name: string, issues: string[]): void {
  if (!uuidPattern.test(value)) issues.push(`${name} must be a UUID`);
}

function optionalUuid(
  value: string | null | undefined,
  name: string,
  issues: string[],
): string | null {
  if (value == null || value.trim() === "") return null;
  validateUuid(value, name, issues);
  return value;
}

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

function optionalCount(
  value: number | null | undefined,
  name: string,
  issues: string[],
): number | null {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    issues.push(`${name} must be a non-negative safe integer`);
  }
  return value;
}

export function validateCreateSampleInput(input: CreateSampleInput) {
  const issues: string[] = [];
  validateUuid(input.engagementId, "engagementId", issues);
  const requirementId = optionalUuid(input.requirementId, "requirementId", issues);
  const scopeId = optionalUuid(input.scopeId, "scopeId", issues);
  const populationDescription = requiredText(
    input.populationDescription,
    "populationDescription",
    issues,
    20_000,
  );
  const samplingMethod = requiredText(input.samplingMethod, "samplingMethod", issues, 500);
  const selectionBasis = requiredText(input.selectionBasis, "selectionBasis", issues, 20_000);
  const populationSize = optionalCount(input.populationSize, "populationSize", issues);
  const sampleSize = optionalCount(input.sampleSize, "sampleSize", issues);

  if (populationSize != null && sampleSize != null && sampleSize > populationSize) {
    issues.push("sampleSize must not exceed populationSize");
  }

  if (issues.length > 0) throw new ExecutionValidationError(issues);
  return {
    engagementId: input.engagementId,
    requirementId,
    scopeId,
    populationDescription,
    populationSize,
    samplingMethod,
    sampleSize,
    selectionBasis,
  };
}

export function validateAddSampleItemInput(input: AddSampleItemInput) {
  const issues: string[] = [];
  validateUuid(input.sampleId, "sampleId", issues);
  const itemKey = requiredText(input.itemKey, "itemKey", issues, 500);
  const selectionReason = requiredText(input.selectionReason, "selectionReason", issues, 10_000);
  const itemSnapshot = input.itemSnapshot ?? {};
  if (issues.length > 0) throw new ExecutionValidationError(issues);
  return { sampleId: input.sampleId, itemKey, selectionReason, itemSnapshot };
}

export function validateReviewSampleInput(input: ReviewSampleInput) {
  const issues: string[] = [];
  validateUuid(input.sampleId, "sampleId", issues);
  if (input.decision !== "APPROVED" && input.decision !== "REJECTED") {
    issues.push("decision must be APPROVED or REJECTED");
  }
  const rationale = requiredText(input.rationale, "rationale", issues, 10_000);
  if (issues.length > 0) throw new ExecutionValidationError(issues);
  return { sampleId: input.sampleId, decision: input.decision, rationale };
}

export function validateLinkWorkpaperRequirementInput(
  input: LinkWorkpaperRequirementInput,
) {
  const issues: string[] = [];
  validateUuid(input.workpaperId, "workpaperId", issues);
  validateUuid(input.applicabilityId, "applicabilityId", issues);
  validateUuid(input.requirementId, "requirementId", issues);
  const controlId = optionalUuid(input.controlId, "controlId", issues);
  if (issues.length > 0) throw new ExecutionValidationError(issues);
  return { ...input, controlId };
}

export function validateLinkWorkpaperSampleInput(input: LinkWorkpaperSampleInput) {
  const issues: string[] = [];
  validateUuid(input.workpaperId, "workpaperId", issues);
  validateUuid(input.sampleId, "sampleId", issues);
  if (issues.length > 0) throw new ExecutionValidationError(issues);
  return input;
}

export function validateDefineProcedureExecutionInput(
  input: DefineProcedureExecutionInput,
) {
  const issues: string[] = [];
  validateUuid(input.procedureId, "procedureId", issues);
  validateUuid(input.requirementId, "requirementId", issues);
  const testObjective = requiredText(input.testObjective, "testObjective", issues, 20_000);
  const expectedEvidence = requiredText(input.expectedEvidence, "expectedEvidence", issues, 20_000);
  const testMethod = requiredText(input.testMethod, "testMethod", issues, 10_000);
  if (issues.length > 0) throw new ExecutionValidationError(issues);
  return {
    procedureId: input.procedureId,
    requirementId: input.requirementId,
    testObjective,
    expectedEvidence,
    testMethod,
  };
}
