import assert from "node:assert/strict";
import test from "node:test";

import { safeFinalizationErrorMessage } from "./safe-error";

test("preserves controlled domain messages", () => {
  assert.equal(
    safeFinalizationErrorMessage(new Error("Engagement cannot enter REVIEW until readiness gates pass")),
    "Engagement cannot enter REVIEW until readiness gates pass",
  );
});

test("maps nested frozen-engagement database errors to a stable semantic message", () => {
  const pg = new Error("Frozen engagement 11111111-1111-4111-8111-111111111111 child record in reviews cannot be mutated");
  const drizzle = new Error("Failed query: insert into reviews(...)\nparams: secret-parameter", { cause: pg });

  assert.equal(
    safeFinalizationErrorMessage(drizzle),
    "Frozen engagement cannot be mutated after audit freeze",
  );
});

test("does not expose raw SQL or query parameters for unknown database failures", () => {
  const message = safeFinalizationErrorMessage(
    new Error("Failed query: update reports set content=$1\nparams: sensitive-content"),
  );

  assert.equal(message, "Finalization action rejected");
  assert.equal(message.includes("update reports"), false);
  assert.equal(message.includes("sensitive-content"), false);
});
