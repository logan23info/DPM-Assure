-- DPM-Assure compliance monitoring for operational obligations and authoritative-source change impact.
-- This is separate from engagement continuous monitoring; no audit engagement is required.

CREATE TYPE compliance_alert_status AS ENUM ('OPEN','ACKNOWLEDGED','RESOLVED');
CREATE TYPE source_change_type AS ENUM ('AMENDED','SUPERSEDED','RETIRED','REVALIDATED');
CREATE TYPE source_change_impact_status AS ENUM ('OPEN','ASSESSED','RESOLVED');

CREATE TABLE source_change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_source_id uuid NOT NULL REFERENCES sources(id),
  new_source_id uuid REFERENCES sources(id),
  change_type source_change_type NOT NULL,
  summary text NOT NULL CHECK (length(btrim(summary)) > 0),
  effective_at timestamptz NOT NULL,
  recorded_by uuid NOT NULL REFERENCES users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (new_source_id IS NULL OR new_source_id <> old_source_id),
  CHECK ((change_type IN ('AMENDED','SUPERSEDED') AND new_source_id IS NOT NULL) OR change_type NOT IN ('AMENDED','SUPERSEDED'))
);

CREATE TRIGGER source_change_events_append_only
BEFORE UPDATE OR DELETE ON source_change_events
FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE TABLE source_change_impacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  source_change_event_id uuid NOT NULL REFERENCES source_change_events(id),
  obligation_rule_id uuid NOT NULL REFERENCES obligation_rules(id),
  applicability_determination_id uuid NOT NULL REFERENCES applicability_determinations(id),
  obligation_instance_id uuid REFERENCES obligation_instances(id),
  status source_change_impact_status NOT NULL DEFAULT 'OPEN',
  rationale text NOT NULL,
  assessed_by uuid REFERENCES users(id),
  assessed_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='OPEN' AND assessed_by IS NULL AND assessed_at IS NULL AND resolved_by IS NULL AND resolved_at IS NULL)
      OR (status='ASSESSED' AND assessed_by IS NOT NULL AND assessed_at IS NOT NULL AND resolved_by IS NULL AND resolved_at IS NULL)
      OR (status='RESOLVED' AND assessed_by IS NOT NULL AND assessed_at IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)),
  UNIQUE NULLS NOT DISTINCT (source_change_event_id, applicability_determination_id, obligation_instance_id)
);
CREATE INDEX source_change_impacts_org_status_idx ON source_change_impacts(organization_id,status,created_at DESC);

CREATE OR REPLACE FUNCTION materialize_source_change_impacts(p_event_id uuid, p_actor_id uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE e source_change_events%ROWTYPE; inserted_count integer;
BEGIN
  SELECT * INTO e FROM source_change_events WHERE id=p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source change event not found'; END IF;

  INSERT INTO source_change_impacts(
    organization_id, source_change_event_id, obligation_rule_id,
    applicability_determination_id, obligation_instance_id, rationale
  )
  SELECT
    d.organization_id, e.id, r.id, d.id, oi.id,
    'Authoritative source change may affect this prior applicability determination or obligation; reassessment required'
  FROM obligation_rules r
  JOIN applicability_determinations d ON d.obligation_rule_id=r.id
  LEFT JOIN obligation_instances oi ON oi.applicability_determination_id=d.id AND oi.status='OPEN'
  WHERE r.source_id=e.old_source_id
    AND d.result IN ('APPLICABLE','REVIEW_REQUIRED')
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END $$;

CREATE TABLE compliance_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  alert_key text NOT NULL,
  alert_type text NOT NULL CHECK (alert_type IN ('OBLIGATION_OVERDUE','SOURCE_CHANGE_IMPACT')),
  obligation_instance_id uuid REFERENCES obligation_instances(id),
  source_change_impact_id uuid REFERENCES source_change_impacts(id),
  severity text NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  title text NOT NULL,
  body text NOT NULL,
  due_at timestamptz,
  status compliance_alert_status NOT NULL DEFAULT 'OPEN',
  acknowledged_by uuid REFERENCES users(id),
  acknowledged_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((alert_type='OBLIGATION_OVERDUE' AND obligation_instance_id IS NOT NULL AND source_change_impact_id IS NULL)
      OR (alert_type='SOURCE_CHANGE_IMPACT' AND source_change_impact_id IS NOT NULL AND obligation_instance_id IS NULL)),
  CHECK ((status='OPEN' AND acknowledged_by IS NULL AND acknowledged_at IS NULL AND resolved_by IS NULL AND resolved_at IS NULL)
      OR (status='ACKNOWLEDGED' AND acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL AND resolved_by IS NULL AND resolved_at IS NULL)
      OR (status='RESOLVED' AND acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)),
  UNIQUE (organization_id, alert_key)
);
CREATE INDEX compliance_alerts_org_status_due_idx ON compliance_alerts(organization_id,status,due_at);

CREATE OR REPLACE FUNCTION refresh_compliance_alerts(p_org_id uuid, p_as_of timestamptz, p_actor_id uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE inserted_count integer := 0; n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id=p_org_id AND m.user_id=p_actor_id AND m.status='ACTIVE') THEN
    RAISE EXCEPTION 'Compliance alert refresh requires an active organization member';
  END IF;

  INSERT INTO compliance_alerts(
    organization_id,alert_key,alert_type,obligation_instance_id,severity,title,body,due_at
  )
  SELECT
    oi.organization_id,
    'OBLIGATION_OVERDUE:' || oi.id::text,
    'OBLIGATION_OVERDUE',oi.id,'CRITICAL',
    'Compliance obligation overdue',
    'A source-backed obligation is past its governed due date and remains OPEN.',
    oi.due_at
  FROM obligation_instances oi
  WHERE oi.organization_id=p_org_id AND oi.status='OPEN' AND oi.due_at < p_as_of
  ON CONFLICT (organization_id,alert_key) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; inserted_count := inserted_count + n;

  INSERT INTO compliance_alerts(
    organization_id,alert_key,alert_type,source_change_impact_id,severity,title,body
  )
  SELECT
    sci.organization_id,
    'SOURCE_CHANGE_IMPACT:' || sci.id::text,
    'SOURCE_CHANGE_IMPACT',sci.id,'WARNING',
    'Source change requires compliance reassessment',
    sci.rationale
  FROM source_change_impacts sci
  WHERE sci.organization_id=p_org_id AND sci.status='OPEN'
  ON CONFLICT (organization_id,alert_key) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; inserted_count := inserted_count + n;

  RETURN inserted_count;
END $$;

CREATE OR REPLACE FUNCTION enforce_compliance_alert_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status=NEW.status THEN RETURN NEW; END IF;
  IF OLD.status='OPEN' AND NEW.status='ACKNOWLEDGED' THEN
    IF NEW.acknowledged_by IS NULL OR NEW.acknowledged_at IS NULL THEN RAISE EXCEPTION 'Acknowledgement metadata is required'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status='ACKNOWLEDGED' AND NEW.status='RESOLVED' THEN
    IF NEW.resolved_by IS NULL OR NEW.resolved_at IS NULL THEN RAISE EXCEPTION 'Resolution metadata is required'; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid compliance alert transition: % -> %', OLD.status, NEW.status;
END $$;
CREATE TRIGGER compliance_alerts_transition_guard
BEFORE UPDATE OF status ON compliance_alerts FOR EACH ROW EXECUTE FUNCTION enforce_compliance_alert_transition();

CREATE OR REPLACE FUNCTION enforce_source_change_impact_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status=NEW.status THEN RETURN NEW; END IF;
  IF OLD.status='OPEN' AND NEW.status='ASSESSED' THEN
    IF NEW.assessed_by IS NULL OR NEW.assessed_at IS NULL THEN RAISE EXCEPTION 'Impact assessment metadata is required'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status='ASSESSED' AND NEW.status='RESOLVED' THEN
    IF NEW.resolved_by IS NULL OR NEW.resolved_at IS NULL THEN RAISE EXCEPTION 'Impact resolution metadata is required'; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Invalid source change impact transition: % -> %', OLD.status, NEW.status;
END $$;
CREATE TRIGGER source_change_impacts_transition_guard
BEFORE UPDATE OF status ON source_change_impacts FOR EACH ROW EXECUTE FUNCTION enforce_source_change_impact_transition();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['source_change_impacts','compliance_alerts']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (organization_id = app_current_organization_id() AND app_is_current_org_member()) WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member())', t || '_tenant_policy', t);
  END LOOP;
END $$;

COMMENT ON TABLE source_change_events IS 'Append-only source-governance event describing an authoritative-source change; does not itself rewrite historical requirements.';
COMMENT ON TABLE source_change_impacts IS 'Tenant impact queue derived from source changes and prior applicability determinations/obligations.';
COMMENT ON TABLE compliance_alerts IS 'Deterministic operational alerts for overdue source-backed obligations and unresolved source-change impacts.';
