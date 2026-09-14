export type GateResult = "PASS" | "FAIL" | "INSUFFICIENT_EVIDENCE";

export interface EvidenceGateDimensions {
  identity: GateResult;
  provenance: GateResult;
  integrity: GateResult;
  authorization: GateResult;
  applicability: GateResult;
  temporal: GateResult;
  completeness: GateResult;
  chainOfCustody: GateResult;
}

export interface EvidenceRegistrationInput {
  engagementId: string;
  workpaperId: string;
  procedureId?: string;
  pbcRequestId?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  sha256: string;
  sourceDescription: string;
  acquiredAt?: string;
  periodStart?: string;
  periodEnd?: string;
}

export class EvidenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceValidationError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireUuid(value: string, field: string): string {
  if (!UUID.test(value)) throw new EvidenceValidationError(`${field} must be a UUID`);
  return value;
}

export function deriveOverallGateResult(dimensions: EvidenceGateDimensions): GateResult {
  const values = Object.values(dimensions);
  if (values.includes("FAIL")) return "FAIL";
  if (values.includes("INSUFFICIENT_EVIDENCE")) return "INSUFFICIENT_EVIDENCE";
  return "PASS";
}

export function validateEvidenceRegistration(input: EvidenceRegistrationInput): EvidenceRegistrationInput {
  requireUuid(input.engagementId, "engagementId");
  requireUuid(input.workpaperId, "workpaperId");
  if (input.procedureId) requireUuid(input.procedureId, "procedureId");
  if (input.pbcRequestId) requireUuid(input.pbcRequestId, "pbcRequestId");
  if (!input.filename.trim()) throw new EvidenceValidationError("filename is required");
  if (!input.mimeType.trim()) throw new EvidenceValidationError("mimeType is required");
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0) throw new EvidenceValidationError("sizeBytes must be a non-negative safe integer");
  if (!input.storageKey.trim()) throw new EvidenceValidationError("storageKey is required");
  if (!SHA256.test(input.sha256)) throw new EvidenceValidationError("sha256 must be a 64-character hexadecimal digest");
  if (!input.sourceDescription.trim()) throw new EvidenceValidationError("sourceDescription is required for provenance");
  if (input.periodStart && !DATE.test(input.periodStart)) throw new EvidenceValidationError("periodStart must be YYYY-MM-DD");
  if (input.periodEnd && !DATE.test(input.periodEnd)) throw new EvidenceValidationError("periodEnd must be YYYY-MM-DD");
  if (input.periodStart && input.periodEnd && input.periodEnd < input.periodStart) throw new EvidenceValidationError("periodEnd must not precede periodStart");
  if (input.acquiredAt && Number.isNaN(Date.parse(input.acquiredAt))) throw new EvidenceValidationError("acquiredAt must be a valid timestamp");
  return { ...input, filename: input.filename.trim(), mimeType: input.mimeType.trim(), storageKey: input.storageKey.trim(), sourceDescription: input.sourceDescription.trim(), sha256: input.sha256.toLowerCase() };
}

export function assertConclusiveTestAllowed(result: "PASS" | "FAIL" | "NOT_TESTED" | "NOT_APPLICABLE", gate: GateResult | null): void {
  if ((result === "PASS" || result === "FAIL") && gate !== "PASS") {
    throw new EvidenceValidationError("Conclusive PASS/FAIL test result requires a PASS evidence gate");
  }
}
