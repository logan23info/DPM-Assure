-- DPM-Assure engagement governance hardening
-- Adds an explicit assurance-team roster and deterministic governance constraints.

CREATE TABLE engagement_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL REFERENCES engagements(id),
  user_id uuid NOT NULL REFERENCES users(id),
  assignment_role membership_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  assigned_by uuid NOT NULL REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CHECK (assignment_role IN ('AUDIT_MANAGER','LEAD_AUDITOR','AUDITOR','REVIEWER')),
  CHECK (ended_at IS NULL OR ended_at >= assigned_at),
  UNIQUE (engagement_id, user_id)
);

CREATE INDEX engagement_assignments_engagement_active_idx
  ON engagement_assignments(engagement_id, active);

ALTER TABLE engagement_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY engagement_assignments_tenant ON engagement_assignments
  USING (app_engagement_in_current_org(engagement_id))
  WITH CHECK (app_engagement_in_current_org(engagement_id));

ALTER TABLE independence_checks
  ADD CONSTRAINT independence_checks_result_valid
  CHECK (result IN ('CLEAR','CONFLICT'));

ALTER TABLE independence_checks
  ADD CONSTRAINT independence_checks_conflict_shape
  CHECK (
    (result = 'CLEAR' AND resolved_by IS NULL AND resolved_at IS NULL)
    OR
    (result = 'CONFLICT' AND conflict_details IS NOT NULL)
  );

ALTER TABLE risk_assessments
  ADD CONSTRAINT risk_assessments_scores_nonnegative
  CHECK (
    (inherent_score IS NULL OR inherent_score >= 0)
    AND (control_score IS NULL OR control_score >= 0)
    AND (residual_score IS NULL OR residual_score >= 0)
  );

-- Governance rule helpers are intentionally deterministic and side-effect free.
CREATE OR REPLACE FUNCTION engagement_independence_ready(candidate_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM engagement_assignments ea
      WHERE ea.engagement_id = candidate_engagement_id
        AND ea.active = true
    )
    AND NOT EXISTS (
      SELECT 1
      FROM engagement_assignments ea
      WHERE ea.engagement_id = candidate_engagement_id
        AND ea.active = true
        AND NOT EXISTS (
          SELECT 1
          FROM LATERAL (
            SELECT ic.result, ic.resolved_by, ic.resolved_at
            FROM independence_checks ic
            WHERE ic.engagement_id = ea.engagement_id
              AND ic.subject_user_id = ea.user_id
            ORDER BY ic.created_at DESC, ic.id DESC
            LIMIT 1
          ) latest
          WHERE latest.result = 'CLEAR'
             OR (
               latest.result = 'CONFLICT'
               AND latest.resolved_by IS NOT NULL
               AND latest.resolved_at IS NOT NULL
             )
        )
    );
$$;

CREATE OR REPLACE FUNCTION engagement_governance_ready(candidate_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    engagement_independence_ready(candidate_engagement_id)
    AND EXISTS (
      SELECT 1
      FROM risk_assessments ra
      WHERE ra.engagement_id = candidate_engagement_id
    )
    AND EXISTS (
      SELECT 1
      FROM audit_plans ap
      WHERE ap.engagement_id = candidate_engagement_id
        AND ap.status = 'APPROVED'
        AND ap.approved_by IS NOT NULL
        AND ap.approved_at IS NOT NULL
    );
$$;

-- The foundation trigger calls enforce_engagement_transition(). Replace that function
-- in place so the existing trigger acquires the new governance rule without trigger drift.
CREATE OR REPLACE FUNCTION enforce_engagement_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'PLANNING' AND NEW.status = 'TESTING' THEN
    IF NOT engagement_governance_ready(OLD.id) THEN
      RAISE EXCEPTION 'Engagement % cannot enter TESTING until independence, risk assessment, and approved audit plan gates pass', OLD.id;
    END IF;
    RETURN NEW;
  END IF;

  -- Preserve all other transitions from the frozen lifecycle truth table.
  IF (OLD.status = 'PLANNING' AND NEW.status = 'CLOSED')
     OR (OLD.status = 'TESTING' AND NEW.status IN ('REVIEW','CLOSED'))
     OR (OLD.status = 'REVIEW' AND NEW.status = 'CLOSED') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid engagement status transition: % -> %', OLD.status, NEW.status;
END;
$$;

COMMENT ON TABLE engagement_assignments IS 'Explicit assurance-team roster used by segregation-of-duties and independence gates.';
COMMENT ON FUNCTION engagement_independence_ready(uuid) IS 'True only when every active assigned assurance team member has a latest independence check that is clear or formally resolved.';
COMMENT ON FUNCTION engagement_governance_ready(uuid) IS 'Deterministic PLANNING-to-TESTING gate: independence ready, risk assessment exists, and an approved audit plan exists.';
