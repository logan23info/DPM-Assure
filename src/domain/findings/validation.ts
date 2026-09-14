export type ObservationType = "NOTE" | "IMPROVEMENT_OPPORTUNITY" | "CONTROL_DEFICIENCY";

export interface CreateObservationInput {
  engagementId: string;
  workpaperId: string;
  testResultId: string;
  observationType: ObservationType;
  description: string;
  significance?: string;
}

export interface CreateExceptionInput {
  engagementId: string;
  workpaperId: string;
  testResultId: string;
  description: string;
  severity: string;
}

export interface CreateFindingInput {
  engagementId: string;
  exceptionId?: string;
  observationId?: string;
  title: string;
  description: string;
  findingType: string;
}

export interface AssessRiskInput {
  findingId: string;
  likelihood: number;
  impact: number;
  methodVersion: string;
  rationale: string;
}

export class FindingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FindingValidationError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBSERVATION_TYPES: readonly ObservationType[] = ["NOTE", "IMPROVEMENT_OPPORTUNITY", "CONTROL_DEFICIENCY"];

function requiredText(value: string, field: string, max: number): string {
  const normalized = value.trim();
  if (!normalized) throw new FindingValidationError(`${field} is required`);
  if (normalized.length > max) throw new FindingValidationError(`${field} must be at most ${max} characters`);
  return normalized;
}

function uuid(value: string, field: string): string {
  if (!UUID.test(value)) throw new FindingValidationError(`${field} must be a UUID`);
  return value;
}

export function validateObservation(input: CreateObservationInput): CreateObservationInput {
  if (!OBSERVATION_TYPES.includes(input.observationType)) throw new FindingValidationError("invalid observationType");
  return {
    engagementId: uuid(input.engagementId, "engagementId"),
    workpaperId: uuid(input.workpaperId, "workpaperId"),
    testResultId: uuid(input.testResultId, "testResultId"),
    observationType: input.observationType,
    description: requiredText(input.description, "description", 10000),
    ...(input.significance?.trim() ? { significance: requiredText(input.significance, "significance", 4000) } : {}),
  };
}

export function validateException(input: CreateExceptionInput): CreateExceptionInput {
  return {
    engagementId: uuid(input.engagementId, "engagementId"),
    workpaperId: uuid(input.workpaperId, "workpaperId"),
    testResultId: uuid(input.testResultId, "testResultId"),
    description: requiredText(input.description, "description", 10000),
    severity: requiredText(input.severity, "severity", 100),
  };
}

export function validateFinding(input: CreateFindingInput): CreateFindingInput {
  const sourceCount = Number(Boolean(input.exceptionId)) + Number(Boolean(input.observationId));
  if (sourceCount !== 1) throw new FindingValidationError("finding requires exactly one primary source: exceptionId or observationId");

  return {
    engagementId: uuid(input.engagementId, "engagementId"),
    ...(input.exceptionId ? { exceptionId: uuid(input.exceptionId, "exceptionId") } : {}),
    ...(input.observationId ? { observationId: uuid(input.observationId, "observationId") } : {}),
    title: requiredText(input.title, "title", 300),
    description: requiredText(input.description, "description", 20000),
    findingType: requiredText(input.findingType, "findingType", 100),
  };
}

export function calculateMultiplicativeRiskScore(likelihood: number, impact: number): number {
  if (!Number.isFinite(likelihood) || !Number.isFinite(impact)) throw new FindingValidationError("risk inputs must be finite numbers");
  if (likelihood < 0 || likelihood > 5) throw new FindingValidationError("likelihood must be between 0 and 5");
  if (impact < 0 || impact > 5) throw new FindingValidationError("impact must be between 0 and 5");
  return Math.round(likelihood * impact * 100) / 100;
}

export function validateRiskAssessment(input: AssessRiskInput): AssessRiskInput & { score: number } {
  const methodVersion = requiredText(input.methodVersion, "methodVersion", 100);
  if (methodVersion !== "DPM-RISK-MULTIPLICATIVE-1") throw new FindingValidationError("unsupported risk methodology");

  return {
    findingId: uuid(input.findingId, "findingId"),
    likelihood: input.likelihood,
    impact: input.impact,
    methodVersion,
    rationale: requiredText(input.rationale, "rationale", 10000),
    score: calculateMultiplicativeRiskScore(input.likelihood, input.impact),
  };
}
