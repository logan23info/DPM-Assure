export interface CreateComplianceProfileInput {
  readonly name: string;
  readonly jurisdiction: string;
}

export interface SetComplianceFactInput {
  readonly profileId: string;
  readonly factKey: string;
  readonly factValue: string;
  readonly sourceReference: string;
}

export interface MaterializeObligationInput {
  readonly determinationId: string;
  readonly triggerAt: Date;
  readonly privacyRecordType?: string | null;
  readonly privacyRecordId?: string | null;
}

function nonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

export function validateCreateComplianceProfile(input: CreateComplianceProfileInput): CreateComplianceProfileInput {
  return {
    name: nonBlank(input.name, "name"),
    jurisdiction: nonBlank(input.jurisdiction, "jurisdiction"),
  };
}

export function validateComplianceFact(input: SetComplianceFactInput): SetComplianceFactInput {
  const factKey = nonBlank(input.factKey, "factKey").toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(factKey)) {
    throw new Error("factKey must be an uppercase deterministic identifier");
  }
  return {
    profileId: nonBlank(input.profileId, "profileId"),
    factKey,
    factValue: nonBlank(input.factValue, "factValue"),
    sourceReference: nonBlank(input.sourceReference, "sourceReference"),
  };
}

export function validateMaterializeObligation(input: MaterializeObligationInput): MaterializeObligationInput {
  if (!(input.triggerAt instanceof Date) || Number.isNaN(input.triggerAt.getTime())) {
    throw new Error("triggerAt must be a valid date");
  }
  const hasType = Boolean(input.privacyRecordType?.trim());
  const hasId = Boolean(input.privacyRecordId?.trim());
  if (hasType !== hasId) throw new Error("privacyRecordType and privacyRecordId must be provided together");
  return {
    determinationId: nonBlank(input.determinationId, "determinationId"),
    triggerAt: input.triggerAt,
    privacyRecordType: input.privacyRecordType?.trim() || null,
    privacyRecordId: input.privacyRecordId?.trim() || null,
  };
}
