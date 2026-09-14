export type RuntimeEnvironment = Readonly<{
  appBaseUrl: string;
  databaseUrl: string;
  authEmailFrom: string;
  resendApiKey: string;
  objectStoreEndpoint: string;
  objectStoreRegion: string;
  objectStoreForcePathStyle: boolean;
  objectStoreAccessKeyId: string;
  objectStoreSecretAccessKey: string;
  objectStoreBucket: string;
  objectStoreUploadUrlTtlSeconds: number;
  objectStoreDownloadUrlTtlSeconds: number;
  evidenceMaxUploadBytes: number;
  groqApiKey: string;
  groqModel: string;
}>;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function absoluteUrl(env: NodeJS.ProcessEnv, name: string, protocols: readonly string[]): string {
  const value = required(env, name);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`${name} must be an absolute URL`); }
  if (!protocols.includes(url.protocol)) throw new Error(`${name} must use ${protocols.join(" or ")}`);
  return value;
}

function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export function validateRuntimeEnvironment(env: NodeJS.ProcessEnv = process.env): RuntimeEnvironment {
  const appBaseUrl = absoluteUrl(env, "APP_BASE_URL", ["http:", "https:"]);
  if (env.NODE_ENV === "production" && new URL(appBaseUrl).protocol !== "https:") throw new Error("APP_BASE_URL must use https in production");
  return Object.freeze({
    appBaseUrl,
    databaseUrl: absoluteUrl(env, "DATABASE_URL", ["postgres:", "postgresql:"]),
    authEmailFrom: required(env, "AUTH_EMAIL_FROM"),
    resendApiKey: required(env, "RESEND_API_KEY"),
    objectStoreEndpoint: absoluteUrl(env, "OBJECT_STORE_ENDPOINT", ["http:", "https:"]),
    objectStoreRegion: env.OBJECT_STORE_REGION?.trim() || "auto",
    objectStoreForcePathStyle: env.OBJECT_STORE_FORCE_PATH_STYLE === "true",
    objectStoreAccessKeyId: required(env, "OBJECT_STORE_ACCESS_KEY_ID"),
    objectStoreSecretAccessKey: required(env, "OBJECT_STORE_SECRET_ACCESS_KEY"),
    objectStoreBucket: required(env, "OBJECT_STORE_BUCKET"),
    objectStoreUploadUrlTtlSeconds: positiveInt(env, "OBJECT_STORE_UPLOAD_URL_TTL_SECONDS", 600),
    objectStoreDownloadUrlTtlSeconds: positiveInt(env, "OBJECT_STORE_DOWNLOAD_URL_TTL_SECONDS", 300),
    evidenceMaxUploadBytes: positiveInt(env, "EVIDENCE_MAX_UPLOAD_BYTES", 52_428_800),
    groqApiKey: required(env, "GROQ_API_KEY"),
    groqModel: required(env, "GROQ_MODEL"),
  });
}

let cached: RuntimeEnvironment | null = null;
export function getRuntimeEnvironment(): RuntimeEnvironment {
  cached ??= validateRuntimeEnvironment();
  return cached;
}
