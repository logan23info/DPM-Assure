import assert from "node:assert/strict";
import test from "node:test";

import {
  EngagementValidationError,
  validateCreateEngagementInput,
} from "./validation";

const clientId = "6cbfce4f-f833-4a21-9438-59bb0c04890c";

test("normalizes a valid engagement input", () => {
  const result = validateCreateEngagementInput({
    clientId,
    name: "  FY27 Privacy Assurance  ",
    description: "  Annual assurance engagement.  ",
    startDate: "2027-01-01",
    endDate: "2027-03-31",
  });

  assert.equal(result.name, "FY27 Privacy Assurance");
  assert.equal(result.description, "Annual assurance engagement.");
  assert.equal(result.startDate, "2027-01-01");
  assert.equal(result.endDate, "2027-03-31");
  assert.equal(result.leadAuditorId, null);
});

test("rejects invalid UUIDs", () => {
  assert.throws(
    () =>
      validateCreateEngagementInput({
        clientId: "not-a-uuid",
        name: "Privacy Audit",
      }),
    EngagementValidationError,
  );
});

test("rejects impossible calendar dates", () => {
  assert.throws(
    () =>
      validateCreateEngagementInput({
        clientId,
        name: "Privacy Audit",
        startDate: "2027-02-30",
      }),
    /startDate must be a valid YYYY-MM-DD date/,
  );
});

test("rejects an end date before the start date", () => {
  assert.throws(
    () =>
      validateCreateEngagementInput({
        clientId,
        name: "Privacy Audit",
        startDate: "2027-04-01",
        endDate: "2027-03-31",
      }),
    /endDate must be on or after startDate/,
  );
});

test("rejects an engagement name outside the contract", () => {
  assert.throws(
    () =>
      validateCreateEngagementInput({
        clientId,
        name: "x",
      }),
    /name must be between 3 and 200 characters/,
  );
});
