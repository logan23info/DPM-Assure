-- DPM-Assure closure governance: REMEDIATION / RISK ACCEPTANCE -> RETEST -> FINDING CLOSURE

ALTER TABLE remediations
  ADD COLUMN organization_id uuid,
  ADD COLUMN engagement_id uuid,
  ADD COLUMN completed_by uuid REFERENCES users(id);

UPDATE remediations r
SET organization_id = f.organization_id,
    engagement_id = f.engagement_id
FROM findings f
WHERE f.id = r.finding_id;

ALTER TABLE remediations
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN engagement_id SET NOT NULL,
  ADD CONSTRAINT remediations_finding_same_context_fk
    FOREIGN KEY (organization_id, engagement_id, finding_id)
    REFERENCES findings(organization_id, engagement_id, id),
  ADD CONSTRAINT remediations_completion_shape_ck
    CHECK (
      (status = 'COMPLETED' AND completed_at IS NOT NULL AND completed_by IS NOT NULL)
      OR
      (status <> 'COMPLETED' AND completed_at IS NULL AND completed_by IS NULL)
    );

ALTER TABLE risk_acceptances
  ADD COLUMN organization_id uuid,
  ADD COLUMN engagement_id uuid,
  ADD COLUMN approval_status review_status NOT NULL DEFAULT 'PENDING',
  ADD COLUMN approved_by uuid REFERENCES users(id),
  ADD COLUMN approved_at timestamptz;

UPDATE risk_acceptances ra
SET organization_id = f.organization_id,
    engagement_id = f.engagement_id
FROM findings f
WHERE f.id = ra.finding_id;

ALTER TABLE risk_acceptances
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN engagement_id SET NOT NULL,
  ADD CONSTRAINT risk_acceptances_finding_same_context_fk
    FOREIGN KEY (organization_id, engagement_id, finding_id)
    REFERENCES findings(organization_id, engagement_id, id),
  ADD CONSTRAINT risk_acceptances_approval_shape_ck
    CHECK (
      (approval_status = 'APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by <> accepted_by)
      OR
      (approval_status <> 'APPROVED' AND approved_by IS NULL AND approved_at IS NULL)
    );

ALTER TABLE retests
  ADD COLUMN organization_id uuid,
  ADD COLUMN engagement_id uuid;

UPDATE retests rt
SET organization_id = f.organization_id,
    engagement_id = f.engagement_id
FROM findings f
WHERE f.id = rt.finding_id;

ALTER TABLE retests
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN engagement_id SET NOT NULL,
  ADD CONSTRAINT retests_finding_same_context_fk
    FOREIGN KEY (organization_id, engagement_id, finding_id)
    REFERENCES findings(organization_id, engagement_id, id);

CREATE INDEX remediations_org_finding_idx ON remediations(organization_id, finding_id);
CREATE INDEX risk_acceptances_org_finding_idx ON risk_acceptances(organization_id, finding_id, approval_status);
CREATE INDEX retests_org_finding_idx ON retests(organization_id, finding_id, tested_at DESC);

CREATE OR REPLACE FUNCTION enforce_retest_evidence_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_finding uuid;
  parent_remediation uuid;
BEGIN
  IF NEW.remediation_id IS NOT NULL THEN
    SELECT finding_id INTO parent_finding FROM remediations WHERE id = NEW.remediation_id;
    IF parent_finding IS DISTINCT FROM NEW.finding_id THEN
      RAISE EXCEPTION 'Retest remediation must belong to the same finding';
    END IF;
  END IF;

  IF NEW.result IN ('PASS','FAIL') THEN
    IF NEW.evidence_id IS NULL THEN
      RAISE EXCEPTION 'Conclusive retest requires evidence';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM evidence_gate_results egr
      WHERE egr.evidence_id = NEW.evidence_id
        AND egr.overall_result = 'PASS'
    ) THEN
      RAISE EXCEPTION 'Conclusive retest requires evidence with a PASS Evidence Gate';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER retests_evidence_gate_guard
BEFORE INSERT OR UPDATE OF finding_id, remediation_id, result, evidence_id ON retests
FOR EACH ROW EXECUTE FUNCTION enforce_retest_evidence_gate();

CREATE OR REPLACE FUNCTION risk_acceptance_is_current(candidate_finding_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM risk_acceptances ra
    WHERE ra.finding_id = candidate_finding_id
      AND ra.approval_status = 'APPROVED'
      AND ra.approved_at IS NOT NULL
      AND ra.expires_at > now()
      AND ra.review_due_at >= now()
  );
$$;

CREATE OR REPLACE FUNCTION remediation_is_verified(candidate_finding_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM remediations r
    JOIN retests rt ON rt.remediation_id = r.id
    WHERE r.finding_id = candidate_finding_id
      AND r.status = 'COMPLETED'
      AND r.completed_at IS NOT NULL
      AND r.completed_by IS NOT NULL
      AND rt.finding_id = candidate_finding_id
      AND rt.result = 'PASS'
      AND rt.evidence_id IS NOT NULL
  );
$$;

CREATE OR REPLACE FUNCTION finding_closure_ready(candidate_finding_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT remediation_is_verified(candidate_finding_id)
      OR risk_acceptance_is_current(candidate_finding_id);
$$;

CREATE OR REPLACE FUNCTION enforce_finding_closure()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'CLOSED' AND NEW.status = 'CLOSED' THEN
    IF NOT finding_closure_ready(OLD.id) THEN
      RAISE EXCEPTION 'Finding % cannot close without verified remediation or a current approved risk acceptance', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER findings_closure_guard
BEFORE UPDATE OF status ON findings
FOR EACH ROW EXECUTE FUNCTION enforce_finding_closure();

DROP POLICY remediations_tenant ON remediations;
CREATE POLICY remediations_current_org ON remediations
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

DROP POLICY risk_acceptances_tenant ON risk_acceptances;
CREATE POLICY risk_acceptances_current_org ON risk_acceptances
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

DROP POLICY retests_tenant ON retests;
CREATE POLICY retests_current_org ON retests
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

COMMENT ON FUNCTION finding_closure_ready(uuid) IS 'Finding may close only after verified remediation or a current approved risk acceptance.';
COMMENT ON FUNCTION remediation_is_verified(uuid) IS 'True when remediation is completed and a PASS retest is backed by evidence.';
COMMENT ON FUNCTION risk_acceptance_is_current(uuid) IS 'True only for approved, unexpired risk acceptance whose review due date has not passed.';
