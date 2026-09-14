import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectMetadata, ObjectStore, PutIntent } from "./object-store";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function client(): S3Client {
  const endpoint = requireEnv("OBJECT_STORE_ENDPOINT");
  const region = process.env.OBJECT_STORE_REGION?.trim() || "auto";
  return new S3Client({
    endpoint,
    region,
    forcePathStyle: process.env.OBJECT_STORE_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: requireEnv("OBJECT_STORE_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("OBJECT_STORE_SECRET_ACCESS_KEY"),
    },
  });
}

export class S3ObjectStore implements ObjectStore {
  private readonly bucket = requireEnv("OBJECT_STORE_BUCKET");
  private readonly s3 = client();

  async createPutIntent(input: { storageKey: string; contentType: string; expiresInSeconds?: number }): Promise<PutIntent> {
    const expiresIn = input.expiresInSeconds ?? positiveInt("OBJECT_STORE_UPLOAD_URL_TTL_SECONDS", 600);
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: input.storageKey, ContentType: input.contentType });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn });
    return {
      storageKey: input.storageKey,
      uploadUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      requiredHeaders: { "content-type": input.contentType },
    };
  }

  async createDownloadUrl(input: { storageKey: string; downloadFilename?: string; expiresInSeconds?: number }): Promise<{ url: string; expiresAt: Date }> {
    const expiresIn = input.expiresInSeconds ?? positiveInt("OBJECT_STORE_DOWNLOAD_URL_TTL_SECONDS", 300);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: input.storageKey,
      ResponseContentDisposition: input.downloadFilename ? `attachment; filename="${input.downloadFilename.replaceAll('"', '')}"` : undefined,
    });
    const url = await getSignedUrl(this.s3, command, { expiresIn });
    return { url, expiresAt: new Date(Date.now() + expiresIn * 1000) };
  }

  async getObject(storageKey: string): Promise<{ bytes: Uint8Array; metadata: ObjectMetadata }> {
    const head = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }));
    if (!response.Body) throw new Error("Object body is missing");
    const bytes = await response.Body.transformToByteArray();
    return {
      bytes,
      metadata: {
        contentType: head.ContentType || "application/octet-stream",
        contentLength: Number(head.ContentLength ?? bytes.byteLength),
        etag: head.ETag ?? undefined,
      },
    };
  }

  async deleteObject(storageKey: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }
}

let singleton: S3ObjectStore | null = null;
export function getObjectStore(): ObjectStore {
  singleton ??= new S3ObjectStore();
  return singleton;
}
