-- DPM-Assure forward-only migration: PBC -> evidence -> evidence gate -> test result

ALTER TABLE pbc_requests
  ADD COLUMN IF NOT EXISTS procedure_id uuid REFERENCES procedures(id),
  ADD COLUMN IF NOT EXISTS requirement_id uuid REFERENCES requirements(id),
  ADD COLUMN IF NOT EXISTS expected_evidence text,
  ADD COLUMN IF NOT EXISTS fulfilled_by uuid REFERENCES users(id);

ALTER TABLE evidence
  ADD COLUMN IF NOT EXISTS pbc_request_id uuid REFERENCES pbc_requests(id),
  ADD COLUMN IF NOT EXISTS acquired_at timestamptz,
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS original_sha256 char(64),
  ADD CONSTRAINT evidence_period_valid CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start),
  ADD CONSTRAINT evidence_original_sha256_format CHECK (original_sha256 IS NULL OR original_sha256 ~ '^[0-9a-fA-F]{64}$');

CREATE TABLE evidence_custody_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  engagement_id uuid NOT NULL REFERENCES engagements(id),
  evidence_id uuid NOT NULL REFERENCES evidence(id),
  event_type text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES users(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  from_location text,
  to_location text,
  sha256 char(64) NOT NULL,
  notes text,
  CONSTRAINT evidence_custody_sha256_format CHECK (sha256 ~ '^[0-9a-fA-F]{64}$')
);

ALTER TABLE evidence_gate_results
  ADD COLUMN IF NOT EXISTS chain_of_custody_status gate_result,
  ADD COLUMN IF NOT EXISTS procedure_id uuid REFERENCES procedures(id),
  ADD COLUMN IF NOT EXISTS evaluated_sha256 char(64),
  ADD CONSTRAINT evidence_gate_evaluated_sha256_format CHECK (evaluated_sha256 IS NULL OR evaluated_sha256 ~ '^[0-9a-fA-F]{64}$');

UPDATE evidence_gate_results
SET chain_of_custody_status = 'INSUFFICIENT_EVIDENCE'
WHERE chain_of_custody_status IS NULL;
ALTER TABLE evidence_gate_results ALTER COLUMN chain_of_custody_status SET NOT NULL;

CREATE OR REPLACE FUNCTION enforce_evidence_gate_overall()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  has_fail boolean;
  has_insufficient boolean;
BEGIN
  has_fail := 'FAIL' = ANY (ARRAY[
    NEW.identity_status::text, NEW.provenance_status::text, NEW.integrity_status::text,
    NEW.authorization_status::text, NEW.applicability_status::text, NEW.temporal_status::text,
    NEW.completeness_status::text, NEW.chain_of_custody_status::text
  ]);
  has_insufficient := 'INSUFFICIENT_EVIDENCE' = ANY (ARRAY[
    NEW.identity_status::text, NEW.provenance_status::text, NEW.integrity_status::text,
    NEW.authorization_status::text, NEW.applicability_status::text, NEW.temporal_status::text,
    NEW.completeness_status::text, NEW.chain_of_custody_status::text
  ]);
  IF has_fail AND NEW.overall_result <> 'FAIL' THEN
    RAISE EXCEPTION 'Evidence gate overall_result must be FAIL when any dimension fails';
  END IF;
  IF NOT has_fail AND has_insufficient AND NEW.overall_result <> 'INSUFFICIENT_EVIDENCE' THEN
    RAISE EXCEPTION 'Evidence gate overall_result must be INSUFFICIENT_EVIDENCE when evidence is insufficient';
  END IF;
  IF NOT has_fail AND NOT has_insufficient AND NEW.overall_result <> 'PASS' THEN
    RAISE EXCEPTION 'Evidence gate overall_result must be PASS when all dimensions pass';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER evidence_gate_overall_guard
BEFORE INSERT OR UPDATE ON evidence_gate_results
FOR EACH ROW EXECUTE FUNCTION enforce_evidence_gate_overall();

CREATE OR REPLACE FUNCTION enforce_test_result_evidence_gate()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE gate gate_result;
BEGIN
  IF NEW.result IN ('PASS','FAIL') THEN
    IF NEW.evidence_gate_result_id IS NULL THEN
      RAISE EXCEPTION 'Conclusive test result requires an evidence gate result';
    END IF;
    SELECT overall_result INTO gate FROM evidence_gate_results WHERE id = NEW.evidence_gate_result_id;
    IF gate IS DISTINCT FROM 'PASS' THEN
      RAISE EXCEPTION 'Conclusive test result requires PASS evidence gate';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER test_result_evidence_gate_guard
BEFORE INSERT OR UPDATE ON test_results
FOR EACH ROW EXECUTE FUNCTION enforce_test_result_evidence_gate();

CREATE OR REPLACE FUNCTION reject_evidence_custody_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'evidence custody events are append-only'; END $$;
CREATE TRIGGER evidence_custody_append_only
BEFORE UPDATE OR DELETE ON evidence_custody_events
FOR EACH ROW EXECUTE FUNCTION reject_evidence_custody_mutation();

CREATE INDEX evidence_pbc_request_idx ON evidence(pbc_request_id);
CREATE INDEX evidence_custody_evidence_idx ON evidence_custody_events(evidence_id, occurred_at);
CREATE INDEX pbc_requests_procedure_idx ON pbc_requests(procedure_id);

ALTER TABLE evidence_custody_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY evidence_custody_current_org ON evidence_custody_events
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());
