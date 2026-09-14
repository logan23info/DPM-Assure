import "server-only";

export interface ObjectMetadata {
  readonly contentType: string;
  readonly contentLength: number;
  readonly etag?: string;
}

export interface PutIntent {
  readonly storageKey: string;
  readonly uploadUrl: string;
  readonly expiresAt: Date;
  readonly requiredHeaders: Readonly<Record<string, string>>;
}

export interface ObjectStore {
  createPutIntent(input: {
    storageKey: string;
    contentType: string;
    expiresInSeconds?: number;
  }): Promise<PutIntent>;
  createDownloadUrl(input: {
    storageKey: string;
    downloadFilename?: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string; expiresAt: Date }>;
  getObject(storageKey: string): Promise<{ bytes: Uint8Array; metadata: ObjectMetadata }>;
  deleteObject(storageKey: string): Promise<void>;
}

export function sanitizeObjectFilename(filename: string): string {
  const normalized = filename.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  if (!normalized || normalized === "." || normalized === "..") return "evidence.bin";
  return normalized.slice(0, 180);
}

export function buildEvidenceStorageKey(input: {
  organizationId: string;
  engagementId: string;
  objectId: string;
  filename: string;
}): string {
  return `organizations/${input.organizationId}/engagements/${input.engagementId}/evidence/${input.objectId}/${sanitizeObjectFilename(input.filename)}`;
}
