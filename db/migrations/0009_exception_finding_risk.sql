-- DPM-Assure outcome normalization: TEST -> EXCEPTION/OBSERVATION -> FINDING -> RISK
-- Preserves distinct assurance concepts and removes the circular findings <-> risks relationship.

CREATE TYPE observation_type AS ENUM ('NOTE','IMPROVEMENT_OPPORTUNITY','CONTROL_DEFICIENCY');

CREATE TABLE observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  engagement_id uuid NOT NULL,
  workpaper_id uuid NOT NULL,
  test_result_id uuid NOT NULL,
  observation_type observation_type NOT NULL,
  description text NOT NULL,
  significance text,
  status workflow_status NOT NULL DEFAULT 'OPEN',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT observations_engagement_same_tenant_fk
    FOREIGN KEY (organization_id, engagement_id)
    REFERENCES engagements(organization_id, id),
  CONSTRAINT observations_workpaper_same_tenant_fk
    FOREIGN KEY (organization_id, workpaper_id)
    REFERENCES workpapers(organization_id, id),
  CONSTRAINT observations_test_same_workpaper_fk
    FOREIGN KEY (workpaper_id, test_result_id)
    REFERENCES test_results(workpaper_id, id)
);

CREATE INDEX observations_org_engagement_idx ON observations(organization_id, engagement_id);
CREATE INDEX observations_test_result_idx ON observations(test_result_id);

ALTER TABLE findings
  ADD COLUMN observation_id uuid REFERENCES observations(id);

-- A formal finding must have one primary assurance source: an exception or an observation.
ALTER TABLE findings
  ADD CONSTRAINT findings_primary_source_ck
  CHECK (num_nonnulls(exception_id, observation_id) = 1);

-- Remove the redundant reverse pointer. risks.finding_id remains the authoritative one-to-one link.
ALTER TABLE findings DROP CONSTRAINT findings_risk_fk;
ALTER TABLE findings DROP COLUMN risk_id;

ALTER TABLE risks
  ADD CONSTRAINT risks_values_nonnegative_ck
  CHECK (likelihood >= 0 AND impact >= 0 AND score >= 0);

CREATE TABLE risk_methodologies (
  method_version text PRIMARY KEY,
  formula_key text NOT NULL CHECK (formula_key IN ('MULTIPLY')),
  likelihood_min numeric(10,2) NOT NULL,
  likelihood_max numeric(10,2) NOT NULL,
  impact_min numeric(10,2) NOT NULL,
  impact_max numeric(10,2) NOT NULL,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  description text NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  CHECK (likelihood_min >= 0 AND likelihood_max >= likelihood_min),
  CHECK (impact_min >= 0 AND impact_max >= impact_min),
  CHECK (retired_at IS NULL OR retired_at >= effective_at)
);

INSERT INTO risk_methodologies (
  method_version, formula_key, likelihood_min, likelihood_max, impact_min, impact_max, description
) VALUES (
  'DPM-RISK-MULTIPLICATIVE-1','MULTIPLY',0,5,0,5,
  'Deterministic DPM-Assure risk score: likelihood multiplied by impact.'
);

CREATE OR REPLACE FUNCTION calculate_risk_score(
  candidate_method_version text,
  candidate_likelihood numeric,
  candidate_impact numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  methodology risk_methodologies%ROWTYPE;
BEGIN
  SELECT * INTO methodology
  FROM risk_methodologies
  WHERE method_version = candidate_method_version
    AND status = 'ACTIVE'
    AND (retired_at IS NULL OR retired_at > now());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown or inactive risk methodology %', candidate_method_version;
  END IF;

  IF candidate_likelihood < methodology.likelihood_min OR candidate_likelihood > methodology.likelihood_max THEN
    RAISE EXCEPTION 'Likelihood % is outside methodology range %..%', candidate_likelihood, methodology.likelihood_min, methodology.likelihood_max;
  END IF;
  IF candidate_impact < methodology.impact_min OR candidate_impact > methodology.impact_max THEN
    RAISE EXCEPTION 'Impact % is outside methodology range %..%', candidate_impact, methodology.impact_min, methodology.impact_max;
  END IF;

  IF methodology.formula_key = 'MULTIPLY' THEN
    RETURN round((candidate_likelihood * candidate_impact)::numeric, 2);
  END IF;

  RAISE EXCEPTION 'Unsupported risk formula %', methodology.formula_key;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_deterministic_risk_score()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE expected_score numeric;
BEGIN
  expected_score := calculate_risk_score(NEW.method_version, NEW.likelihood, NEW.impact);
  IF NEW.score IS DISTINCT FROM expected_score THEN
    RAISE EXCEPTION 'Risk score % must equal deterministic score % for methodology %', NEW.score, expected_score, NEW.method_version;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER risks_deterministic_score_guard
BEFORE INSERT OR UPDATE OF likelihood, impact, score, method_version ON risks
FOR EACH ROW EXECUTE FUNCTION enforce_deterministic_risk_score();

CREATE OR REPLACE FUNCTION enforce_exception_failed_test()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE test_status test_result_status;
BEGIN
  SELECT result INTO test_status FROM test_results WHERE id = NEW.test_result_id;
  IF test_status IS DISTINCT FROM 'FAIL'::test_result_status THEN
    RAISE EXCEPTION 'Exception requires a FAIL test result; got %', test_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER exceptions_failed_test_guard
BEFORE INSERT OR UPDATE OF test_result_id ON exceptions
FOR EACH ROW EXECUTE FUNCTION enforce_exception_failed_test();

CREATE OR REPLACE FUNCTION enforce_finding_source_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_org uuid;
  source_engagement uuid;
BEGIN
  IF NEW.exception_id IS NOT NULL THEN
    SELECT organization_id, engagement_id INTO source_org, source_engagement
    FROM exceptions WHERE id = NEW.exception_id;
  ELSE
    SELECT organization_id, engagement_id INTO source_org, source_engagement
    FROM observations WHERE id = NEW.observation_id;
  END IF;

  IF source_org IS DISTINCT FROM NEW.organization_id OR source_engagement IS DISTINCT FROM NEW.engagement_id THEN
    RAISE EXCEPTION 'Finding source must belong to the same tenant and engagement';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER findings_source_lineage_guard
BEFORE INSERT OR UPDATE OF organization_id, engagement_id, exception_id, observation_id ON findings
FOR EACH ROW EXECUTE FUNCTION enforce_finding_source_lineage();

ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations FORCE ROW LEVEL SECURITY;
CREATE POLICY observations_current_org ON observations
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE risk_methodologies ENABLE ROW LEVEL SECURITY;
CREATE POLICY risk_methodologies_read ON risk_methodologies FOR SELECT
  USING (app_is_current_org_member());

COMMENT ON TABLE observations IS 'Auditor observations are distinct from exceptions and formal findings.';
COMMENT ON COLUMN findings.exception_id IS 'Primary exception source for a formal finding when observation_id is null.';
COMMENT ON COLUMN findings.observation_id IS 'Primary observation source for a formal finding when exception_id is null.';
COMMENT ON TABLE risk_methodologies IS 'Versioned deterministic risk scoring methodologies. DPM rules, not legal requirements.';
COMMENT ON FUNCTION calculate_risk_score(text,numeric,numeric) IS 'Deterministically calculates risk score from a versioned DPM-Assure methodology.';
