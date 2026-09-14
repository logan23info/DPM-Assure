-- DPM-Assure privacy notifications and escalation foundation.
-- Legal deadlines are not hard-coded here. Alerting uses explicit governed due/review dates.

ALTER TABLE dpia_assessments
  ADD COLUMN next_review_at timestamptz;

ALTER TABLE privacy_breaches
  ADD COLUMN notification_due_at timestamptz,
  ADD COLUMN notification_requirement_reference text,
  ADD CONSTRAINT privacy_breaches_notification_due_shape_ck CHECK (
    notification_due_at IS NULL OR notification_required IS TRUE
  );

CREATE TYPE privacy_alert_status AS ENUM ('OPEN','ACKNOWLEDGED','RESOLVED');
CREATE TYPE privacy_alert_severity AS ENUM ('MEDIUM','HIGH','CRITICAL');

CREATE TABLE privacy_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  record_type text NOT NULL CHECK (record_type IN ('PROCESSING_ACTIVITY','DPIA','PROCESSOR','TRANSFER','DSR','BREACH')),
  record_id uuid NOT NULL,
  alert_type text NOT NULL CHECK (alert_type IN ('REVIEW_OVERDUE','REQUEST_OVERDUE','NOTIFICATION_OVERDUE')),
  severity privacy_alert_severity NOT NULL,
  due_at timestamptz NOT NULL,
  status privacy_alert_status NOT NULL DEFAULT 'OPEN',
  assigned_to uuid REFERENCES users(id),
  acknowledged_by uuid REFERENCES users(id),
  acknowledged_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  source_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, record_type, record_id, alert_type, due_at),
  CHECK ((status='ACKNOWLEDGED' AND acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL) OR status<>'ACKNOWLEDGED'),
  CHECK ((status='RESOLVED' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL) OR status<>'RESOLVED')
);

ALTER TABLE privacy_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_alerts FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_alerts_tenant_policy ON privacy_alerts
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

CREATE INDEX privacy_alerts_org_status_due_idx ON privacy_alerts(organization_id,status,due_at);

CREATE OR REPLACE FUNCTION refresh_privacy_alerts(candidate_organization_id uuid, as_of timestamptz DEFAULT now())
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE inserted_count integer := 0;
DECLARE n integer := 0;
BEGIN
  INSERT INTO privacy_alerts(organization_id,record_type,record_id,alert_type,severity,due_at,assigned_to)
  SELECT organization_id,'PROCESSING_ACTIVITY',id,'REVIEW_OVERDUE','HIGH',next_review_at,owner_user_id
  FROM processing_activities
  WHERE organization_id=candidate_organization_id
    AND state='ACTIVE'
    AND next_review_at IS NOT NULL AND next_review_at < as_of
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; inserted_count := inserted_count + n;

  INSERT INTO privacy_alerts(organization_id,record_type,record_id,alert_type,severity,due_at)
  SELECT organization_id,'DPIA',id,'REVIEW_OVERDUE','HIGH',next_review_at
  FROM dpia_assessments
  WHERE organization_id=candidate_organization_id
    AND decision='APPROVED'
    AND next_review_at IS NOT NULL AND next_review_at < as_of
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; inserted_count := inserted_count + n;

  INSERT INTO privacy_alerts(organization_id,record_type,record_id,alert_type,severity,due_at,assigned_to)
  SELECT organization_id,'PROCESSOR',id,'REVIEW_OVERDUE','HIGH',next_review_at,owner_user_id
  FROM processors
  WHERE organization_id=candidate_organization_id
    AND status='ACTIVE'
    AND next_review_at IS NOT NULL AND next_review_at < as_of
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; inserted_count := inserted_count + n;

  INSERT INTO privacy_alerts(organization_id,record_type,record_id,alert_type,severity,due_at)
  SELECT organization_id,'TRANSFER',id,'REVIEW_OVERDUE','HIGH',next_review_at
  FROM international_transfers
  WHERE organization_id=candidate_organization_id
    AND state='ACTIVE'
    AND next_review_at IS NOT NULL AND next_review_at < as_of
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; inserted_count := inserted_count + n;

  INSERT INTO privacy_alerts(organization_id,record_type,record_id,alert_type,severity,due_at,assigned_to)
  SELECT organization_id,'DSR',id,'REQUEST_OVERDUE','CRITICAL',due_at,assigned_to
  FROM data_subject_requests
  WHERE organization_id=candidate_organization_id
    AND due_at IS NOT NULL AND due_at < as_of
    AND status NOT IN ('COMPLETED','REJECTED','CANCELLED')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; inserted_count := inserted_count + n;

  INSERT INTO privacy_alerts(organization_id,record_type,record_id,alert_type,severity,due_at,assigned_to,source_reference)
  SELECT organization_id,'BREACH',id,'NOTIFICATION_OVERDUE','CRITICAL',notification_due_at,owner_user_id,notification_requirement_reference
  FROM privacy_breaches
  WHERE organization_id=candidate_organization_id
    AND notification_required IS TRUE
    AND notification_due_at IS NOT NULL AND notification_due_at < as_of
    AND authority_notified_at IS NULL AND subjects_notified_at IS NULL
    AND status <> 'CLOSED'
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT; inserted_count := inserted_count + n;

  RETURN inserted_count;
END $$;

CREATE OR REPLACE FUNCTION enforce_privacy_alert_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NOT (
    (OLD.status='OPEN' AND NEW.status IN ('ACKNOWLEDGED','RESOLVED')) OR
    (OLD.status='ACKNOWLEDGED' AND NEW.status='RESOLVED')
  ) THEN RAISE EXCEPTION 'Invalid privacy alert transition: % -> %', OLD.status, NEW.status; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER privacy_alerts_status_guard
BEFORE UPDATE OF status ON privacy_alerts
FOR EACH ROW EXECUTE FUNCTION enforce_privacy_alert_transition();

COMMENT ON FUNCTION refresh_privacy_alerts(uuid,timestamptz) IS 'Creates idempotent overdue alerts from explicit due/review dates. It does not invent statutory deadlines.';
