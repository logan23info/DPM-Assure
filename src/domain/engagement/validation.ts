export interface CreateEngagementInput {
  readonly clientId: string;
  readonly name: string;
  readonly description?: string | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly leadAuditorId?: string | null;
}

export interface ValidatedCreateEngagementInput {
  readonly clientId: string;
  readonly name: string;
  readonly description: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly leadAuditorId: string | null;
}

export class EngagementValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid engagement input: ${issues.join("; ")}`);
    this.name = "EngagementValidationError";
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function isValidIsoDate(value: string): boolean {
  if (!isoDatePattern.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function validateCreateEngagementInput(
  input: CreateEngagementInput,
): ValidatedCreateEngagementInput {
  const issues: string[] = [];
  const name = input.name.trim();
  const description = normalizeOptionalText(input.description);
  const startDate = normalizeOptionalText(input.startDate);
  const endDate = normalizeOptionalText(input.endDate);
  const leadAuditorId = normalizeOptionalText(input.leadAuditorId);

  if (!uuidPattern.test(input.clientId)) {
    issues.push("clientId must be a UUID");
  }

  if (name.length < 3 || name.length > 200) {
    issues.push("name must be between 3 and 200 characters");
  }

  if (description && description.length > 10_000) {
    issues.push("description must not exceed 10000 characters");
  }

  if (startDate && !isValidIsoDate(startDate)) {
    issues.push("startDate must be a valid YYYY-MM-DD date");
  }

  if (endDate && !isValidIsoDate(endDate)) {
    issues.push("endDate must be a valid YYYY-MM-DD date");
  }

  if (startDate && endDate && startDate > endDate) {
    issues.push("endDate must be on or after startDate");
  }

  if (leadAuditorId && !uuidPattern.test(leadAuditorId)) {
    issues.push("leadAuditorId must be a UUID when provided");
  }

  if (issues.length > 0) {
    throw new EngagementValidationError(issues);
  }

  return {
    clientId: input.clientId,
    name,
    description,
    startDate,
    endDate,
    leadAuditorId,
  };
}
