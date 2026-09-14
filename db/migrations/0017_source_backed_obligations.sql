-- DPM-Assure source-backed applicability and obligation engine.
-- Legal/standard truth remains in sources + framework_versions + requirements.
-- This migration only operationalizes a verified requirement through deterministic, versioned rules.

CREATE TYPE applicability_result AS ENUM ('APPLICABLE','NOT_APPLICABLE','REVIEW_REQUIRED');
CREATE TYPE obligation_offset_unit AS ENUM ('HOURS','DAYS','CALENDAR_MONTHS');
CREATE TYPE obligation_instance_status AS ENUM ('OPEN','SATISFIED','CANCELLED');

CREATE TABLE compliance_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  jurisdiction text NOT NULL CHECK (length(btrim(jurisdiction)) > 0),
  status record_status NOT NULL DEFAULT 'ACTIVE',
  validated_by uuid NOT NULL REFERENCES users(id),
  validated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, name)
);

CREATE TABLE compliance_profile_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  profile_id uuid NOT NULL,
  fact_key text NOT NULL CHECK (fact_key ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  fact_value text NOT NULL CHECK (length(btrim(fact_value)) > 0),
  source_reference text NOT NULL CHECK (length(btrim(source_reference)) > 0),
  validated_by uuid NOT NULL REFERENCES users(id),
  validated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (profile_id, organization_id) REFERENCES compliance_profiles(id, organization_id),
  UNIQUE (profile_id, fact_key)
);

-- Global governed rule. condition_facts is a flat JSON object of exact fact-key/value matches.
-- An empty object means no additional profile-fact condition beyond jurisdiction/effective dates.
CREATE TABLE obligation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  requirement_id uuid NOT NULL REFERENCES requirements(id),
  source_id uuid NOT NULL REFERENCES sources(id),
  jurisdiction text NOT NULL CHECK (length(btrim(jurisdiction)) > 0),
  trigger_type text NOT NULL CHECK (trigger_type ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  offset_value integer NOT NULL CHECK (offset_value >= 0),
  offset_unit obligation_offset_unit NOT NULL,
  condition_facts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(condition_facts) = 'object'),
  effective_at timestamptz NOT NULL,
  retired_at timestamptz,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  rationale text NOT NULL CHECK (length(btrim(rationale)) > 0),
  validated_by uuid NOT NULL REFERENCES users(id),
  validated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (retired_at IS NULL OR retired_at >= effective_at),
  UNIQUE (rule_key, version)
);
CREATE INDEX obligation_rules_requirement_idx ON obligation_rules(requirement_id, jurisdiction, status);

CREATE OR REPLACE FUNCTION validate_obligation_rule_provenance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE linked_source uuid; source_effective timestamptz; source_retired timestamptz;
BEGIN
  SELECT fv.source_id INTO linked_source
  FROM requirements r
  JOIN framework_versions fv ON fv.id = r.framework_version_id
  WHERE r.id = NEW.requirement_id;

  IF linked_source IS NULL OR linked_source <> NEW.source_id THEN
    RAISE EXCEPTION 'Obligation rule source must match the requirement framework version source';
  END IF;

  SELECT s.effective_at, s.retired_at INTO source_effective, source_retired
  FROM sources s WHERE s.id = NEW.source_id AND s.status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Obligation rule requires an ACTIVE source'; END IF;
  IF source_effective IS NOT NULL AND NEW.effective_at < source_effective THEN
    RAISE EXCEPTION 'Obligation rule cannot become effective before its source';
  END IF;
  IF source_retired IS NOT NULL AND (NEW.retired_at IS NULL OR NEW.retired_at > source_retired) THEN
    RAISE EXCEPTION 'Obligation rule validity cannot extend beyond source retirement';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER obligation_rules_provenance_guard
BEFORE INSERT OR UPDATE OF requirement_id, source_id, effective_at, retired_at, status
ON obligation_rules FOR EACH ROW EXECUTE FUNCTION validate_obligation_rule_provenance();

CREATE TABLE applicability_determinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  profile_id uuid NOT NULL,
  obligation_rule_id uuid NOT NULL REFERENCES obligation_rules(id),
  result applicability_result NOT NULL,
  rationale text NOT NULL CHECK (length(btrim(rationale)) > 0),
  fact_snapshot jsonb NOT NULL CHECK (jsonb_typeof(fact_snapshot) = 'object'),
  evaluated_by uuid NOT NULL REFERENCES users(id),
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (profile_id, organization_id) REFERENCES compliance_profiles(id, organization_id),
  UNIQUE (profile_id, obligation_rule_id)
);
CREATE INDEX applicability_org_result_idx ON applicability_determinations(organization_id, result);

CREATE OR REPLACE FUNCTION evaluate_obligation_rule(
  p_profile_id uuid,
  p_rule_id uuid,
  p_actor_id uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  p compliance_profiles%ROWTYPE;
  r obligation_rules%ROWTYPE;
  facts jsonb;
  result_value applicability_result;
  reason text;
  determination_id uuid;
BEGIN
  SELECT * INTO p FROM compliance_profiles WHERE id=p_profile_id AND status='ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active compliance profile not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id=p.organization_id AND m.user_id=p_actor_id AND m.status='ACTIVE') THEN
    RAISE EXCEPTION 'Applicability evaluator must be an active organization member';
  END IF;
  SELECT * INTO r FROM obligation_rules WHERE id=p_rule_id AND status='ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active obligation rule not found'; END IF;

  SELECT coalesce(jsonb_object_agg(fact_key, fact_value), '{}'::jsonb) INTO facts
  FROM compliance_profile_facts WHERE profile_id=p.id;

  IF upper(p.jurisdiction) <> upper(r.jurisdiction) THEN
    result_value := 'NOT_APPLICABLE'; reason := 'Profile jurisdiction does not match rule jurisdiction';
  ELSIF r.condition_facts <@ facts THEN
    result_value := 'APPLICABLE'; reason := 'All deterministic source-backed rule conditions matched validated profile facts';
  ELSE
    -- Missing/nonmatching facts are not silently interpreted as non-applicability.
    result_value := 'REVIEW_REQUIRED'; reason := 'Rule conditions were not fully established by validated profile facts';
  END IF;

  INSERT INTO applicability_determinations(
    organization_id, profile_id, obligation_rule_id, result, rationale, fact_snapshot, evaluated_by
  ) VALUES (p.organization_id, p.id, r.id, result_value, reason, facts, p_actor_id)
  ON CONFLICT (profile_id, obligation_rule_id) DO UPDATE SET
    result=EXCLUDED.result, rationale=EXCLUDED.rationale, fact_snapshot=EXCLUDED.fact_snapshot,
    evaluated_by=EXCLUDED.evaluated_by, evaluated_at=now()
  RETURNING id INTO determination_id;
  RETURN determination_id;
END $$;

CREATE TABLE obligation_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  profile_id uuid NOT NULL,
  applicability_determination_id uuid NOT NULL REFERENCES applicability_determinations(id),
  obligation_rule_id uuid NOT NULL REFERENCES obligation_rules(id),
  privacy_record_type text,
  privacy_record_id uuid,
  trigger_at timestamptz NOT NULL,
  due_at timestamptz NOT NULL,
  status obligation_instance_status NOT NULL DEFAULT 'OPEN',
  source_reference text NOT NULL CHECK (length(btrim(source_reference)) > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  satisfied_at timestamptz,
  satisfied_by uuid REFERENCES users(id),
  FOREIGN KEY (profile_id, organization_id) REFERENCES compliance_profiles(id, organization_id),
  CHECK ((privacy_record_type IS NULL AND privacy_record_id IS NULL) OR (privacy_record_type IS NOT NULL AND privacy_record_id IS NOT NULL)),
  CHECK ((status='SATISFIED' AND satisfied_at IS NOT NULL AND satisfied_by IS NOT NULL) OR status <> 'SATISFIED'),
  UNIQUE (applicability_determination_id, privacy_record_type, privacy_record_id, trigger_at)
);
CREATE INDEX obligation_instances_org_due_idx ON obligation_instances(organization_id, status, due_at);

CREATE OR REPLACE FUNCTION calculate_obligation_due_at(p_trigger_at timestamptz, p_value integer, p_unit obligation_offset_unit)
RETURNS timestamptz LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_unit
    WHEN 'HOURS' THEN p_trigger_at + make_interval(hours => p_value)
    WHEN 'DAYS' THEN p_trigger_at + make_interval(days => p_value)
    WHEN 'CALENDAR_MONTHS' THEN p_trigger_at + make_interval(months => p_value)
  END
$$;

CREATE OR REPLACE FUNCTION materialize_obligation_instance(
  p_determination_id uuid,
  p_trigger_at timestamptz,
  p_actor_id uuid,
  p_privacy_record_type text DEFAULT NULL,
  p_privacy_record_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE d applicability_determinations%ROWTYPE; r obligation_rules%ROWTYPE; instance_id uuid; computed_due timestamptz;
BEGIN
  SELECT * INTO d FROM applicability_determinations WHERE id=p_determination_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Applicability determination not found'; END IF;
  IF d.result <> 'APPLICABLE' THEN RAISE EXCEPTION 'Only APPLICABLE determinations can materialize obligations'; END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id=d.organization_id AND m.user_id=p_actor_id AND m.status='ACTIVE') THEN
    RAISE EXCEPTION 'Obligation creator must be an active organization member';
  END IF;
  SELECT * INTO r FROM obligation_rules WHERE id=d.obligation_rule_id AND status='ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active obligation rule not found'; END IF;
  IF p_trigger_at < r.effective_at OR (r.retired_at IS NOT NULL AND p_trigger_at > r.retired_at) THEN
    RAISE EXCEPTION 'Trigger timestamp falls outside rule validity';
  END IF;
  IF (p_privacy_record_type IS NULL) <> (p_privacy_record_id IS NULL) THEN
    RAISE EXCEPTION 'Privacy record type and id must be provided together';
  END IF;
  IF p_privacy_record_type IS NOT NULL AND NOT privacy_record_exists_in_org(p_privacy_record_type,p_privacy_record_id,d.organization_id) THEN
    RAISE EXCEPTION 'Linked privacy record does not exist in obligation organization';
  END IF;

  computed_due := calculate_obligation_due_at(p_trigger_at, r.offset_value, r.offset_unit);
  INSERT INTO obligation_instances(
    organization_id, profile_id, applicability_determination_id, obligation_rule_id,
    privacy_record_type, privacy_record_id, trigger_at, due_at, source_reference, created_by
  ) VALUES (
    d.organization_id, d.profile_id, d.id, r.id,
    p_privacy_record_type, p_privacy_record_id, p_trigger_at, computed_due,
    r.rule_key || ':v' || r.version::text, p_actor_id
  ) RETURNING id INTO instance_id;
  RETURN instance_id;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['compliance_profiles','compliance_profile_facts','applicability_determinations','obligation_instances']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (organization_id = app_current_organization_id() AND app_is_current_org_member()) WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member())', t || '_tenant_policy', t);
  END LOOP;
END $$;

COMMENT ON TABLE obligation_rules IS 'Versioned DPM system rules that operationalize an authoritative source-backed requirement; not independent legal truth.';
COMMENT ON TABLE obligation_instances IS 'Materialized obligations with due dates derived only from an APPLICABLE determination and a versioned source-backed rule.';
