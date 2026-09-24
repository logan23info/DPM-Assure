-- Enforce remediation completion and tester independence at the database boundary.

CREATE OR REPLACE FUNCTION enforce_retest_evidence_gate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_organization uuid;
  parent_engagement uuid;
  parent_finding uuid;
  remediation_status text;
  remediation_completed_by uuid;
BEGIN
  IF NEW.remediation_id IS NOT NULL THEN
    SELECT organization_id, engagement_id, finding_id, status::text, completed_by
      INTO parent_organization, parent_engagement, parent_finding, remediation_status, remediation_completed_by
    FROM remediations
    WHERE id = NEW.remediation_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Retest remediation was not found';
    END IF;

    IF parent_organization IS DISTINCT FROM NEW.organization_id
       OR parent_engagement IS DISTINCT FROM NEW.engagement_id
       OR parent_finding IS DISTINCT FROM NEW.finding_id THEN
      RAISE EXCEPTION 'Retest remediation must belong to the same finding';
    END IF;

    IF remediation_status IS DISTINCT FROM 'COMPLETED'
       OR remediation_completed_by IS NULL THEN
      RAISE EXCEPTION 'Remediation must be completed before retesting';
    END IF;

    IF remediation_completed_by = NEW.tested_by THEN
      RAISE EXCEPTION 'Remediation completer cannot independently retest the same remediation';
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
      AND rt.tested_by <> r.completed_by
  );
$$;

COMMENT ON FUNCTION enforce_retest_evidence_gate() IS 'Requires linked remediation completion, independent retesting, and PASS-gated evidence for conclusive retests.';
COMMENT ON FUNCTION remediation_is_verified(uuid) IS 'True when remediation is completed and independently PASS-retested with evidence.';
