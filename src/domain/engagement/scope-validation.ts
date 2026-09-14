export type ApplicabilityDecision = "APPLICABLE" | "NOT_APPLICABLE" | "PENDING";

export interface SelectFrameworkInput {
  readonly engagementId: string;
  readonly frameworkVersionId: string;
}

export interface DefineScopeInput {
  readonly engagementId: string;
  readonly name: string;
  readonly description?: string | null;
  readonly scopeType: string;
  readonly inScope: boolean;
  readonly rationale: string;
}

export interface DecideApplicabilityInput {
  readonly engagementId: string;
  readonly requirementId: string;
  readonly decision: Exclude<ApplicabilityDecision, "PENDING">;
  readonly rationale: string;
}

export class ScopeValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid framework/scope input: ${issues.join("; ")}`);
    this.name = "ScopeValidationError";
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(value: string, name: string, issues: string[]) {
  if (!uuidPattern.test(value)) issues.push(`${name} must be a UUID`);
}

function required(value: string, name: string, max: number, issues: string[]) {
  const normalized = value.trim();
  if (!normalized) issues.push(`${name} is required`);
  if (normalized.length > max) issues.push(`${name} must not exceed ${max} characters`);
  return normalized;
}

export function validateSelectFramework(input: SelectFrameworkInput) {
  const issues: string[] = [];
  uuid(input.engagementId, "engagementId", issues);
  uuid(input.frameworkVersionId, "frameworkVersionId", issues);
  if (issues.length) throw new ScopeValidationError(issues);
  return input;
}

export function validateDefineScope(input: DefineScopeInput) {
  const issues: string[] = [];
  uuid(input.engagementId, "engagementId", issues);
  const name = required(input.name, "name", 250, issues);
  const scopeType = required(input.scopeType, "scopeType", 100, issues);
  const rationale = required(input.rationale, "rationale", 10_000, issues);
  const description = input.description?.trim() || null;
  if (description && description.length > 20_000) issues.push("description must not exceed 20000 characters");
  if (issues.length) throw new ScopeValidationError(issues);
  return { ...input, name, scopeType, rationale, description };
}

export function validateApplicabilityDecision(input: DecideApplicabilityInput) {
  const issues: string[] = [];
  uuid(input.engagementId, "engagementId", issues);
  uuid(input.requirementId, "requirementId", issues);
  if (input.decision !== "APPLICABLE" && input.decision !== "NOT_APPLICABLE") {
    issues.push("decision must be APPLICABLE or NOT_APPLICABLE");
  }
  const rationale = required(input.rationale, "rationale", 10_000, issues);
  if (issues.length) throw new ScopeValidationError(issues);
  return { ...input, rationale };
}
