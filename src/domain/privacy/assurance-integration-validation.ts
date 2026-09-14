export const privacyAssuranceRecordTypes = [
  "PROCESSING_ACTIVITY",
  "DPIA",
  "PROCESSOR",
  "TRANSFER",
  "RETENTION_RULE",
  "NOTICE",
  "CONSENT",
  "DSR",
  "BREACH",
  "PRIVACY_ALERT",
] as const;

export type PrivacyAssuranceRecordType = (typeof privacyAssuranceRecordTypes)[number];
export type PrivacyAssuranceCandidateType = "SCOPE" | "EVIDENCE_REQUEST";

export interface ProposePrivacyAssuranceCandidateInput {
  readonly engagementId: string;
  readonly privacyRecordType: PrivacyAssuranceRecordType;
  readonly privacyRecordId: string;
  readonly candidateType: PrivacyAssuranceCandidateType;
  readonly suggestedTitle: string;
  readonly rationale: string;
  readonly suggestedEvidence?: string | null;
}

function requireNonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

export function validatePrivacyAssuranceCandidateInput(
  input: ProposePrivacyAssuranceCandidateInput,
): ProposePrivacyAssuranceCandidateInput {
  if (!privacyAssuranceRecordTypes.includes(input.privacyRecordType)) {
    throw new Error("Unsupported privacy record type");
  }
  if (input.candidateType !== "SCOPE" && input.candidateType !== "EVIDENCE_REQUEST") {
    throw new Error("Unsupported privacy assurance candidate type");
  }

  const suggestedEvidence = input.suggestedEvidence?.trim() || null;
  if (input.candidateType === "EVIDENCE_REQUEST" && !suggestedEvidence) {
    throw new Error("suggestedEvidence is required for EVIDENCE_REQUEST candidates");
  }

  return {
    ...input,
    engagementId: requireNonEmpty(input.engagementId, "engagementId"),
    privacyRecordId: requireNonEmpty(input.privacyRecordId, "privacyRecordId"),
    suggestedTitle: requireNonEmpty(input.suggestedTitle, "suggestedTitle"),
    rationale: requireNonEmpty(input.rationale, "rationale"),
    suggestedEvidence,
  };
}

export function validatePrivacyAssuranceDecisionRationale(rationale: string): string {
  return requireNonEmpty(rationale, "decision rationale");
}
