import assert from "node:assert/strict";
import test from "node:test";
import { redactForLog } from "./logger";

test("redacts secret-bearing keys recursively", () => {
  assert.deepEqual(redactForLog({ requestId: "r1", sessionToken: "abc", nested: { apiKey: "xyz" } }), { requestId: "r1", sessionToken: "[REDACTED]", nested: { apiKey: "[REDACTED]" } });
});

test("redacts bearer tokens and signed query URLs in free text", () => {
  const result = redactForLog("failed Bearer abc.def at https://objects.example.com/a?X-Amz-Signature=secret");
  assert.equal(result, "failed [REDACTED] at [REDACTED]");
});

test("keeps non-sensitive correlation metadata", () => {
  assert.deepEqual(redactForLog({ requestId: "req-1", organizationId: "org-1", event: "denied" }), { requestId: "req-1", organizationId: "org-1", event: "denied" });
});
