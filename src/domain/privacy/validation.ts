const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;

export class PrivacyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivacyValidationError";
  }
}

function requiredText(value: string, field: string, max = 10000): string {
  const normalized = value.trim();
  if (!normalized) throw new PrivacyValidationError(`${field} is required`);
  if (normalized.length > max) throw new PrivacyValidationError(`${field} exceeds ${max} characters`);
  return normalized;
}

function optionalText(value: string | undefined, field: string, max = 10000): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length > max) throw new PrivacyValidationError(`${field} exceeds ${max} characters`);
  return normalized;
}

function uuid(value: string, field: string): string {
  if (!UUID_RE.test(value)) throw new PrivacyValidationError(`${field} must be a valid UUID`);
  return value;
}

function isoDateTime(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new PrivacyValidationError(`${field} must be a valid date-time`);
  return parsed;
}

export interface CreateProcessingActivityInput {
  name: string;
  purpose: string;
  controllerProcessorRole: "CONTROLLER" | "PROCESSOR" | "JOINT_CONTROLLER";
  clientId?: string;
  lawfulBasis?: string;
  dataSubjectCategories?: string[];
  personalDataCategories?: string[];
  specialCategoryData?: boolean;
  recipients?: string[];
  retentionSummary?: string;
  securityMeasuresSummary?: string;
  ownerUserId?: string;
}

export function validateProcessingActivity(input: CreateProcessingActivityInput) {
  if (!["CONTROLLER","PROCESSOR","JOINT_CONTROLLER"].includes(input.controllerProcessorRole)) {
    throw new PrivacyValidationError("controllerProcessorRole is invalid");
  }
  return {
    name: requiredText(input.name, "name", 300),
    purpose: requiredText(input.purpose, "purpose"),
    controllerProcessorRole: input.controllerProcessorRole,
    clientId: input.clientId ? uuid(input.clientId, "clientId") : undefined,
    lawfulBasis: optionalText(input.lawfulBasis, "lawfulBasis", 1000),
    dataSubjectCategories: (input.dataSubjectCategories ?? []).map((v) => requiredText(v, "dataSubjectCategory", 300)),
    personalDataCategories: (input.personalDataCategories ?? []).map((v) => requiredText(v, "personalDataCategory", 300)),
    specialCategoryData: input.specialCategoryData ?? false,
    recipients: (input.recipients ?? []).map((v) => requiredText(v, "recipient", 500)),
    retentionSummary: optionalText(input.retentionSummary, "retentionSummary"),
    securityMeasuresSummary: optionalText(input.securityMeasuresSummary, "securityMeasuresSummary"),
    ownerUserId: input.ownerUserId ? uuid(input.ownerUserId, "ownerUserId") : undefined,
  };
}

export interface CreateDpiaInput {
  processingActivityId: string;
  screeningRationale: string;
  decision: "NOT_REQUIRED" | "REQUIRED" | "IN_PROGRESS" | "REJECTED";
  riskSummary?: string;
  mitigationSummary?: string;
  residualRisk?: string;
}

export function validateDpia(input: CreateDpiaInput) {
  if (input.decision === "APPROVED" as string) throw new PrivacyValidationError("DPIA approval requires the dedicated approval operation");
  return {
    processingActivityId: uuid(input.processingActivityId, "processingActivityId"),
    screeningRationale: requiredText(input.screeningRationale, "screeningRationale"),
    decision: input.decision,
    riskSummary: optionalText(input.riskSummary, "riskSummary"),
    mitigationSummary: optionalText(input.mitigationSummary, "mitigationSummary"),
    residualRisk: optionalText(input.residualRisk, "residualRisk"),
  };
}

export interface RegisterProcessorInput {
  name: string;
  serviceDescription: string;
  country?: string;
  contractReference?: string;
  dpaReference?: string;
  securityReviewStatus?: string;
  ownerUserId?: string;
}

export function validateProcessor(input: RegisterProcessorInput) {
  return {
    name: requiredText(input.name, "name", 300),
    serviceDescription: requiredText(input.serviceDescription, "serviceDescription"),
    country: optionalText(input.country, "country", 200),
    contractReference: optionalText(input.contractReference, "contractReference", 1000),
    dpaReference: optionalText(input.dpaReference, "dpaReference", 1000),
    securityReviewStatus: optionalText(input.securityReviewStatus, "securityReviewStatus", 300),
    ownerUserId: input.ownerUserId ? uuid(input.ownerUserId, "ownerUserId") : undefined,
  };
}

export interface CreateTransferInput {
  processingActivityId: string;
  processorId?: string;
  destinationCountry: string;
  mechanism: "ADEQUACY" | "SCC" | "BCR" | "DEROGATION" | "OTHER";
  mechanismReference?: string;
  transferRiskAssessmentReference?: string;
  supplementaryMeasures?: string;
}

export function validateTransfer(input: CreateTransferInput) {
  if (!["ADEQUACY","SCC","BCR","DEROGATION","OTHER"].includes(input.mechanism)) {
    throw new PrivacyValidationError("transfer mechanism is invalid");
  }
  if (input.mechanism === "OTHER" && !input.mechanismReference?.trim()) {
    throw new PrivacyValidationError("OTHER transfer mechanism requires mechanismReference");
  }
  return {
    processingActivityId: uuid(input.processingActivityId, "processingActivityId"),
    processorId: input.processorId ? uuid(input.processorId, "processorId") : undefined,
    destinationCountry: requiredText(input.destinationCountry, "destinationCountry", 200),
    mechanism: input.mechanism,
    mechanismReference: optionalText(input.mechanismReference, "mechanismReference", 2000),
    transferRiskAssessmentReference: optionalText(input.transferRiskAssessmentReference, "transferRiskAssessmentReference", 2000),
    supplementaryMeasures: optionalText(input.supplementaryMeasures, "supplementaryMeasures"),
  };
}

export interface CreateDsrInput {
  requestType: string;
  subjectReferenceHash: string;
  receivedAt: string;
  dueAt?: string;
  assignedTo?: string;
}

export function validateDsr(input: CreateDsrInput) {
  if (!SHA256_RE.test(input.subjectReferenceHash)) throw new PrivacyValidationError("subjectReferenceHash must be a lowercase SHA-256 digest");
  const receivedAt = isoDateTime(input.receivedAt, "receivedAt");
  const dueAt = input.dueAt ? isoDateTime(input.dueAt, "dueAt") : undefined;
  if (dueAt && dueAt < receivedAt) throw new PrivacyValidationError("dueAt cannot be before receivedAt");
  return {
    requestType: requiredText(input.requestType, "requestType", 200),
    subjectReferenceHash: input.subjectReferenceHash,
    receivedAt,
    dueAt,
    assignedTo: input.assignedTo ? uuid(input.assignedTo, "assignedTo") : undefined,
  };
}

export interface RecordBreachInput {
  title: string;
  detectedAt: string;
  occurredAt?: string;
  description: string;
  dataCategories?: string[];
  affectedSubjectsEstimate?: number;
  severity?: string;
  notificationRequired?: boolean;
  notificationRationale?: string;
  ownerUserId?: string;
}

export function validateBreach(input: RecordBreachInput) {
  const detectedAt = isoDateTime(input.detectedAt, "detectedAt");
  const occurredAt = input.occurredAt ? isoDateTime(input.occurredAt, "occurredAt") : undefined;
  if (occurredAt && occurredAt > detectedAt) throw new PrivacyValidationError("occurredAt cannot be after detectedAt");
  if (input.affectedSubjectsEstimate !== undefined && (!Number.isInteger(input.affectedSubjectsEstimate) || input.affectedSubjectsEstimate < 0)) {
    throw new PrivacyValidationError("affectedSubjectsEstimate must be a nonnegative integer");
  }
  if (input.notificationRequired !== undefined && !input.notificationRationale?.trim()) {
    throw new PrivacyValidationError("notification decision requires notificationRationale");
  }
  return {
    title: requiredText(input.title, "title", 500),
    detectedAt,
    occurredAt,
    description: requiredText(input.description, "description"),
    dataCategories: (input.dataCategories ?? []).map((v) => requiredText(v, "dataCategory", 300)),
    affectedSubjectsEstimate: input.affectedSubjectsEstimate,
    severity: optionalText(input.severity, "severity", 200),
    notificationRequired: input.notificationRequired,
    notificationRationale: optionalText(input.notificationRationale, "notificationRationale"),
    ownerUserId: input.ownerUserId ? uuid(input.ownerUserId, "ownerUserId") : undefined,
  };
}
