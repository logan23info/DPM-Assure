-- DPM-Assure final assurance governance: REVIEW/QA -> HUMAN SIGN-OFF -> REPORT -> AUDIT FREEZE

ALTER TABLE reviews
  ADD CONSTRAINT reviews_approval_shape_ck
  CHECK (
    (status = 'APPROVED' AND reviewed_at IS NOT NULL)
    OR (status <> 'APPROVED')
  );

ALTER TABLE signoffs
  ADD COLUMN signoff_type text NOT NULL DEFAULT 'ENGAGEMENT_FINAL',
  ADD CONSTRAINT signoffs_approval_shape_ck
  CHECK (
    (status = 'APPROVED' AND signed_at IS NOT NULL)
    OR (status <> 'APPROVED' AND signed_at IS NULL)
  ),
  ADD CONSTRAINT signoffs_assurance_role_ck
  CHECK (role IN ('AUDIT_MANAGER','REVIEWER'));

ALTER TABLE reports
  ADD CONSTRAINT reports_approval_shape_ck
  CHECK (
    (status = 'APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND approved_by <> generated_by)
    OR (status <> 'APPROVED' AND approved_by IS NULL AND approved_at IS NULL)
  );

CREATE OR REPLACE FUNCTION enforce_review_independence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prepared_by_user uuid;
  engagement_org uuid;
BEGIN
  SELECT e.organization_id INTO engagement_org
  FROM engagements e
  WHERE e.id = NEW.engagement_id;

  IF engagement_org IS NULL THEN
    RAISE EXCEPTION 'Review engagement % does not exist', NEW.engagement_id;
  END IF;

  IF NEW.workpaper_id IS NOT NULL THEN
    SELECT w.prepared_by INTO prepared_by_user
    FROM workpapers w
    WHERE w.id = NEW.workpaper_id
      AND w.engagement_id = NEW.engagement_id;

    IF prepared_by_user IS NULL THEN
      RAISE EXCEPTION 'Review workpaper must belong to the same engagement';
    END IF;
    IF prepared_by_user = NEW.reviewer_id THEN
      RAISE EXCEPTION 'Workpaper preparer cannot independently review the same workpaper';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM memberships m
    WHERE m.organization_id = engagement_org
      AND m.user_id = NEW.reviewer_id
      AND m.status = 'ACTIVE'
      AND m.role IN ('AUDIT_MANAGER','REVIEWER')
  ) THEN
    RAISE EXCEPTION 'Reviewer must be an active AUDIT_MANAGER or REVIEWER in the engagement organization';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER reviews_independence_guard
BEFORE INSERT OR UPDATE OF engagement_id, workpaper_id, reviewer_id, status ON reviews
FOR EACH ROW EXECUTE FUNCTION enforce_review_independence();

CREATE OR REPLACE FUNCTION enforce_human_signoff()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE engagement_org uuid;
BEGIN
  SELECT organization_id INTO engagement_org FROM engagements WHERE id = NEW.engagement_id;
  IF engagement_org IS NULL THEN
    RAISE EXCEPTION 'Sign-off engagement % does not exist', NEW.engagement_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = engagement_org
      AND m.user_id = NEW.reviewed_by
      AND m.status = 'ACTIVE'
      AND m.role = NEW.role
      AND m.role IN ('AUDIT_MANAGER','REVIEWER')
  ) THEN
    RAISE EXCEPTION 'Sign-off requires an active human assurance member whose membership role matches the sign-off role';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER signoffs_human_authorization_guard
BEFORE INSERT OR UPDATE OF engagement_id, reviewed_by, role, status ON signoffs
FOR EACH ROW EXECUTE FUNCTION enforce_human_signoff();

CREATE OR REPLACE FUNCTION enforce_report_approval_independence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE engagement_org uuid;
BEGIN
  IF NEW.status = 'APPROVED' THEN
    SELECT organization_id INTO engagement_org FROM engagements WHERE id = NEW.engagement_id;
    IF NOT EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.organization_id = engagement_org
        AND m.user_id = NEW.approved_by
        AND m.status = 'ACTIVE'
        AND m.role IN ('AUDIT_MANAGER','REVIEWER')
    ) THEN
      RAISE EXCEPTION 'Report approver must be an active AUDIT_MANAGER or REVIEWER in the engagement organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER reports_independent_approval_guard
BEFORE INSERT OR UPDATE OF engagement_id, status, generated_by, approved_by ON reports
FOR EACH ROW EXECUTE FUNCTION enforce_report_approval_independence();

CREATE OR REPLACE FUNCTION engagement_review_ready(candidate_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    EXISTS (SELECT 1 FROM workpapers w WHERE w.engagement_id = candidate_engagement_id)
    AND NOT EXISTS (
      SELECT 1 FROM workpapers w
      WHERE w.engagement_id = candidate_engagement_id
        AND NOT EXISTS (
          SELECT 1 FROM reviews r
          WHERE r.engagement_id = candidate_engagement_id
            AND r.workpaper_id = w.id
            AND r.status = 'APPROVED'
            AND r.reviewed_at IS NOT NULL
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM exceptions x
      WHERE x.engagement_id = candidate_engagement_id
        AND x.status NOT IN ('CLOSED','CANCELLED')
    )
    AND NOT EXISTS (
      SELECT 1 FROM observations o
      WHERE o.engagement_id = candidate_engagement_id
        AND o.status NOT IN ('CLOSED','CANCELLED')
    )
    AND NOT EXISTS (
      SELECT 1 FROM findings f
      WHERE f.engagement_id = candidate_engagement_id
        AND f.status <> 'CLOSED'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pbc_requests p
      WHERE p.engagement_id = candidate_engagement_id
        AND p.status NOT IN ('COMPLETED','CLOSED','CANCELLED')
    );
$$;

CREATE OR REPLACE FUNCTION engagement_signoff_ready(candidate_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT engagement_review_ready(candidate_engagement_id)
    AND EXISTS (
      SELECT 1 FROM signoffs s
      WHERE s.engagement_id = candidate_engagement_id
        AND s.signoff_type = 'ENGAGEMENT_FINAL'
        AND s.status = 'APPROVED'
        AND s.signed_at IS NOT NULL
        AND s.role IN ('AUDIT_MANAGER','REVIEWER')
    );
$$;

CREATE OR REPLACE FUNCTION engagement_report_ready(candidate_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM reports r
    WHERE r.engagement_id = candidate_engagement_id
      AND r.version = (SELECT max(r2.version) FROM reports r2 WHERE r2.engagement_id = candidate_engagement_id)
      AND r.status = 'APPROVED'
      AND r.approved_by IS NOT NULL
      AND r.approved_at IS NOT NULL
      AND r.approved_by <> r.generated_by
  );
$$;

CREATE OR REPLACE FUNCTION engagement_closure_ready(candidate_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT engagement_review_ready(candidate_engagement_id)
     AND engagement_signoff_ready(candidate_engagement_id)
     AND engagement_report_ready(candidate_engagement_id);
$$;

CREATE OR REPLACE FUNCTION engagement_freeze_ready(candidate_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM engagements e
    WHERE e.id = candidate_engagement_id
      AND e.status = 'CLOSED'
      AND e.frozen_at IS NULL
  ) AND engagement_closure_ready(candidate_engagement_id);
$$;

-- Preserve the frozen lifecycle truth table while hardening REVIEW -> CLOSED.
CREATE OR REPLACE FUNCTION enforce_engagement_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  IF OLD.status = 'PLANNING' AND NEW.status = 'TESTING' THEN
    IF NOT engagement_governance_ready(OLD.id) THEN
      RAISE EXCEPTION 'Engagement % cannot enter TESTING until independence, risk assessment, and approved audit plan gates pass', OLD.id;
    END IF;
    IF NOT engagement_scope_ready(OLD.id) THEN
      RAISE EXCEPTION 'Engagement % cannot enter TESTING until framework, scope, and applicability gates pass', OLD.id;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'REVIEW' AND NEW.status = 'CLOSED' THEN
    IF NOT engagement_closure_ready(OLD.id) THEN
      RAISE EXCEPTION 'Engagement % cannot close from REVIEW until QA review, human sign-off, resolved items, and approved final report gates pass', OLD.id;
    END IF;
    RETURN NEW;
  END IF;

  -- Administrative closure before final assurance remains allowed by the current truth table,
  -- but such an engagement will not satisfy the audit-freeze gate.
  IF (OLD.status = 'PLANNING' AND NEW.status = 'CLOSED')
     OR (OLD.status = 'TESTING' AND NEW.status IN ('REVIEW','CLOSED')) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid engagement status transition: % -> %', OLD.status, NEW.status;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_audit_freeze_readiness()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE expected_version integer;
BEGIN
  IF NOT engagement_freeze_ready(NEW.engagement_id) THEN
    RAISE EXCEPTION 'Engagement % is not ready for audit freeze', NEW.engagement_id;
  END IF;

  SELECT COALESCE(max(version),0) + 1 INTO expected_version
  FROM audit_freezes
  WHERE engagement_id = NEW.engagement_id;

  IF NEW.version <> expected_version THEN
    RAISE EXCEPTION 'Audit freeze version % must be the next sequential version %', NEW.version, expected_version;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_freezes_readiness_guard
BEFORE INSERT ON audit_freezes
FOR EACH ROW EXECUTE FUNCTION enforce_audit_freeze_readiness();

CREATE OR REPLACE FUNCTION apply_audit_freeze()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE engagements
  SET frozen_at = NEW.frozen_at
  WHERE id = NEW.engagement_id AND frozen_at IS NULL;

  UPDATE workpapers
  SET frozen_at = NEW.frozen_at
  WHERE engagement_id = NEW.engagement_id AND frozen_at IS NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_freezes_apply_guard
AFTER INSERT ON audit_freezes
FOR EACH ROW EXECUTE FUNCTION apply_audit_freeze();

-- Broad post-freeze mutation guard for engagement-scoped assurance records that carry engagement_id.
CREATE OR REPLACE FUNCTION reject_frozen_child_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data jsonb;
  candidate_engagement_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN row_data := to_jsonb(OLD); ELSE row_data := to_jsonb(NEW); END IF;
  candidate_engagement_id := NULLIF(row_data ->> 'engagement_id','')::uuid;

  IF candidate_engagement_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM engagements e WHERE e.id = candidate_engagement_id AND e.frozen_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Frozen engagement % child record in % cannot be mutated', candidate_engagement_id, TG_TABLE_NAME;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE TRIGGER scopes_post_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON scopes FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();
CREATE TRIGGER engagement_requirement_applicability_post_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON engagement_requirement_applicability FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();
CREATE TRIGGER samples_post_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON samples FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();
CREATE TRIGGER pbc_requests_post_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON pbc_requests FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();
CREATE TRIGGER evidence_post_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON evidence FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();
CREATE TRIGGER test_results_post_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON test_results FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();
CREATE TRIGGER exceptions_post_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON exceptions FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();
CREATE TRIGGER observations_post_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON observations FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();
CREATE TRIGGER findings_post_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON findings FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();
CREATE TRIGGER risks_post_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON risks FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();
CREATE TRIGGER remediations_post_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON remediations FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();
CREATE TRIGGER risk_acceptances_post_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON risk_acceptances FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();
CREATE TRIGGER retests_post_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON retests FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();
CREATE TRIGGER reviews_post_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON reviews FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();
CREATE TRIGGER signoffs_post_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON signoffs FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();
CREATE TRIGGER reports_post_freeze_guard BEFORE INSERT OR UPDATE OR DELETE ON reports FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();

COMMENT ON FUNCTION engagement_closure_ready(uuid) IS 'REVIEW-to-CLOSED gate: independent workpaper review, no unresolved assurance items, approved human sign-off, and approved latest report.';
COMMENT ON FUNCTION engagement_freeze_ready(uuid) IS 'Audit freeze requires a CLOSED, not-yet-frozen engagement that still satisfies all final assurance gates.';
COMMENT ON FUNCTION reject_frozen_child_mutation() IS 'Rejects ordinary mutation of engagement-scoped assurance records after audit freeze.';