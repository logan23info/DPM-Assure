import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceStorageKey, sanitizeObjectFilename } from "./object-store";

test("sanitizes unsafe evidence filenames",()=>{
  assert.equal(sanitizeObjectFilename(" ../Access Report (Q1).csv "),"..-Access-Report-Q1-.csv");
  assert.equal(sanitizeObjectFilename("   "),"evidence.bin");
  assert.ok(sanitizeObjectFilename("a".repeat(500)+".txt").length<=180);
});

test("builds tenant and engagement scoped storage keys",()=>{
  assert.equal(buildEvidenceStorageKey({organizationId:"org-1",engagementId:"eng-1",objectId:"obj-1",filename:"proof.pdf"}),"organizations/org-1/engagements/eng-1/evidence/obj-1/proof.pdf");
});
