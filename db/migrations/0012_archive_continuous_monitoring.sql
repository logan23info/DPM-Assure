-- DPM-Assure post-assurance lifecycle: ARCHIVE -> CONTINUOUS MONITORING -> CHANGE/NEW EVIDENCE -> REASSESSMENT
-- Frozen historical engagements are never reopened or silently rewritten.

CREATE TYPE monitoring_result AS ENUM ('CLEAR','CHANGE_DETECTED','INSUFFICIENT_EVIDENCE');
CREATE TYPE reassessment_decision AS ENUM ('NO_ACTION','UPDATE_MONITORING','NEW_ENGAGEMENT');

CREATE TABLE engagement_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  engagement_id uuid NOT NULL UNIQUE REFERENCES engagements(id),
  audit_freeze_id uuid NOT NULL UNIQUE REFERENCES audit_freezes(id),
  archived_by uuid NOT NULL REFERENCES users(id),
  archived_at timestamptz NOT NULL DEFAULT now(),
  retention_until timestamptz,
  archive_reason text NOT NULL,
  CHECK (retention_until IS NULL OR retention_until > archived_at)
);

CREATE TABLE monitoring_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  baseline_engagement_id uuid NOT NULL REFERENCES engagements(id),
  name text NOT NULL,
  cadence_days integer NOT NULL CHECK (cadence_days > 0),
  next_due_at timestamptz NOT NULL,
  status workflow_status NOT NULL DEFAULT 'OPEN',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE monitoring_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  monitoring_program_id uuid NOT NULL REFERENCES monitoring_programs(id),
  result monitoring_result NOT NULL,
  summary text NOT NULL,
  checked_by uuid NOT NULL REFERENCES users(id),
  checked_at timestamptz NOT NULL DEFAULT now(),
  evidence_id uuid REFERENCES evidence(id)
);

CREATE TABLE change_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  baseline_engagement_id uuid NOT NULL REFERENCES engagements(id),
  monitoring_check_id uuid REFERENCES monitoring_checks(id),
  evidence_id uuid REFERENCES evidence(id),
  change_type text NOT NULL,
  description text NOT NULL,
  status workflow_status NOT NULL DEFAULT 'OPEN',
  detected_by uuid NOT NULL REFERENCES users(id),
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (monitoring_check_id IS NOT NULL OR evidence_id IS NOT NULL)
);

CREATE TABLE reassessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  baseline_engagement_id uuid NOT NULL REFERENCES engagements(id),
  change_event_id uuid NOT NULL UNIQUE REFERENCES change_events(id),
  decision reassessment_decision NOT NULL,
  rationale text NOT NULL,
  assessed_by uuid NOT NULL REFERENCES users(id),
  assessed_at timestamptz NOT NULL DEFAULT now(),
  successor_engagement_id uuid REFERENCES engagements(id),
  CHECK (
    (decision = 'NEW_ENGAGEMENT' AND successor_engagement_id IS NOT NULL)
    OR (decision <> 'NEW_ENGAGEMENT' AND successor_engagement_id IS NULL)
  )
);

CREATE INDEX monitoring_programs_org_due_idx ON monitoring_programs(organization_id,next_due_at,status);
CREATE INDEX monitoring_checks_program_time_idx ON monitoring_checks(monitoring_program_id,checked_at DESC);
CREATE INDEX change_events_org_status_idx ON change_events(organization_id,status,detected_at DESC);
CREATE INDEX reassessments_baseline_idx ON reassessments(baseline_engagement_id,assessed_at DESC);

CREATE OR REPLACE FUNCTION enforce_archive_baseline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE freeze_engagement uuid;
DECLARE engagement_org uuid;
BEGIN
  SELECT engagement_id INTO freeze_engagement FROM audit_freezes WHERE id = NEW.audit_freeze_id;
  SELECT organization_id INTO engagement_org FROM engagements WHERE id = NEW.engagement_id;

  IF freeze_engagement IS DISTINCT FROM NEW.engagement_id THEN
    RAISE EXCEPTION 'Archive must reference an audit freeze for the same engagement';
  END IF;
  IF engagement_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Archive organization must match engagement organization';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM engagements e
    WHERE e.id = NEW.engagement_id
      AND e.status = 'CLOSED'
      AND e.frozen_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Only a CLOSED and frozen engagement may be archived';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER engagement_archives_baseline_guard
BEFORE INSERT ON engagement_archives
FOR EACH ROW EXECUTE FUNCTION enforce_archive_baseline();

CREATE TRIGGER engagement_archives_append_only
BEFORE UPDATE OR DELETE ON engagement_archives
FOR EACH ROW EXECUTE FUNCTION reject_mutation();

CREATE OR REPLACE FUNCTION enforce_monitoring_baseline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE engagement_org uuid;
BEGIN
  SELECT organization_id INTO engagement_org FROM engagements WHERE id = NEW.baseline_engagement_id;
  IF engagement_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Monitoring baseline organization mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM engagement_archives a
    WHERE a.engagement_id = NEW.baseline_engagement_id
      AND a.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Continuous monitoring requires an archived assurance baseline';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER monitoring_programs_baseline_guard
BEFORE INSERT OR UPDATE OF organization_id,baseline_engagement_id ON monitoring_programs
FOR EACH ROW EXECUTE FUNCTION enforce_monitoring_baseline();

CREATE OR REPLACE FUNCTION enforce_monitoring_check_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE program_org uuid;
DECLARE baseline uuid;
BEGIN
  SELECT organization_id, baseline_engagement_id INTO program_org, baseline
  FROM monitoring_programs WHERE id = NEW.monitoring_program_id;
  IF program_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Monitoring check must belong to the same organization as its program';
  END IF;
  IF NEW.evidence_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM evidence e
    WHERE e.id = NEW.evidence_id
      AND e.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Monitoring evidence must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER monitoring_checks_lineage_guard
BEFORE INSERT OR UPDATE OF organization_id,monitoring_program_id,evidence_id ON monitoring_checks
FOR EACH ROW EXECUTE FUNCTION enforce_monitoring_check_lineage();

CREATE OR REPLACE FUNCTION enforce_change_event_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE baseline_org uuid;
DECLARE check_baseline uuid;
BEGIN
  SELECT organization_id INTO baseline_org FROM engagements WHERE id = NEW.baseline_engagement_id;
  IF baseline_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Change event baseline organization mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM engagement_archives a WHERE a.engagement_id = NEW.baseline_engagement_id) THEN
    RAISE EXCEPTION 'Change event must reference an archived baseline engagement';
  END IF;
  IF NEW.monitoring_check_id IS NOT NULL THEN
    SELECT mp.baseline_engagement_id INTO check_baseline
    FROM monitoring_checks mc
    JOIN monitoring_programs mp ON mp.id = mc.monitoring_program_id
    WHERE mc.id = NEW.monitoring_check_id;
    IF check_baseline IS DISTINCT FROM NEW.baseline_engagement_id THEN
      RAISE EXCEPTION 'Monitoring check and change event must reference the same archived baseline';
    END IF;
  END IF;
  IF NEW.evidence_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM evidence e WHERE e.id = NEW.evidence_id AND e.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Change-event evidence must belong to the same organization';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER change_events_lineage_guard
BEFORE INSERT OR UPDATE OF organization_id,baseline_engagement_id,monitoring_check_id,evidence_id ON change_events
FOR EACH ROW EXECUTE FUNCTION enforce_change_event_lineage();

CREATE OR REPLACE FUNCTION enforce_reassessment_successor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE change_org uuid;
DECLARE change_baseline uuid;
DECLARE successor_org uuid;
BEGIN
  SELECT organization_id, baseline_engagement_id INTO change_org, change_baseline
  FROM change_events WHERE id = NEW.change_event_id;

  IF change_org IS DISTINCT FROM NEW.organization_id OR change_baseline IS DISTINCT FROM NEW.baseline_engagement_id THEN
    RAISE EXCEPTION 'Reassessment must use the same organization and archived baseline as its change event';
  END IF;

  IF NEW.decision = 'NEW_ENGAGEMENT' THEN
    SELECT organization_id INTO successor_org FROM engagements WHERE id = NEW.successor_engagement_id;
    IF successor_org IS DISTINCT FROM NEW.organization_id THEN
      RAISE EXCEPTION 'Successor engagement must belong to the same organization';
    END IF;
    IF NEW.successor_engagement_id = NEW.baseline_engagement_id THEN
      RAISE EXCEPTION 'Frozen baseline engagement cannot be reused as its own reassessment successor';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER reassessments_successor_guard
BEFORE INSERT OR UPDATE OF organization_id,baseline_engagement_id,change_event_id,decision,successor_engagement_id ON reassessments
FOR EACH ROW EXECUTE FUNCTION enforce_reassessment_successor();

ALTER TABLE engagement_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_archives FORCE ROW LEVEL SECURITY;
CREATE POLICY engagement_archives_current_org ON engagement_archives
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE monitoring_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_programs FORCE ROW LEVEL SECURITY;
CREATE POLICY monitoring_programs_current_org ON monitoring_programs
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE monitoring_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY monitoring_checks_current_org ON monitoring_checks
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE change_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_events FORCE ROW LEVEL SECURITY;
CREATE POLICY change_events_current_org ON change_events
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE reassessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reassessments FORCE ROW LEVEL SECURITY;
CREATE POLICY reassessments_current_org ON reassessments
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

COMMENT ON TABLE engagement_archives IS 'Append-only archive record for a completed frozen engagement baseline.';
COMMENT ON TABLE monitoring_programs IS 'Continuous monitoring definitions anchored to immutable archived assurance baselines.';
COMMENT ON TABLE change_events IS 'Meaningful post-audit changes or new evidence requiring controlled assessment.';
COMMENT ON TABLE reassessments IS 'Controlled decision for a post-audit change; NEW_ENGAGEMENT creates a successor rather than reopening frozen history.';