import assert from "node:assert/strict";
import test from "node:test";
import { validateRuntimeEnvironment } from "./runtime-env";

function valid(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    APP_BASE_URL: "https://assure.example.com",
    DATABASE_URL: "postgres://runtime@db.example.com/dpm",
    AUTH_EMAIL_FROM: "DPM-Assure <no-reply@example.com>",
    RESEND_API_KEY: "test-resend",
    OBJECT_STORE_ENDPOINT: "https://objects.example.com",
    OBJECT_STORE_REGION: "auto",
    OBJECT_STORE_FORCE_PATH_STYLE: "false",
    OBJECT_STORE_ACCESS_KEY_ID: "test-access",
    OBJECT_STORE_SECRET_ACCESS_KEY: "test-secret",
    OBJECT_STORE_BUCKET: "evidence",
    OBJECT_STORE_UPLOAD_URL_TTL_SECONDS: "600",
    OBJECT_STORE_DOWNLOAD_URL_TTL_SECONDS: "300",
    EVIDENCE_MAX_UPLOAD_BYTES: "52428800",
    GROQ_API_KEY: "test-groq",
    GROQ_MODEL: "test-model",
  };
}

test("accepts a complete production configuration", () => {
  const result = validateRuntimeEnvironment(valid());
  assert.equal(result.objectStoreBucket, "evidence");
  assert.equal(result.evidenceMaxUploadBytes, 52_428_800);
});

test("fails closed when a required secret is absent", () => {
  const env = valid(); delete env.OBJECT_STORE_SECRET_ACCESS_KEY;
  assert.throws(() => validateRuntimeEnvironment(env), /OBJECT_STORE_SECRET_ACCESS_KEY is required/);
});

test("requires https application origin in production", () => {
  const env = valid(); env.APP_BASE_URL = "http://assure.example.com";
  assert.throws(() => validateRuntimeEnvironment(env), /must use https in production/);
});

test("rejects invalid numeric limits", () => {
  const env = valid(); env.EVIDENCE_MAX_UPLOAD_BYTES = "0";
  assert.throws(() => validateRuntimeEnvironment(env), /positive integer/);
});
