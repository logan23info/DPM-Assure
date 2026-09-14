-- DPM-Assure privacy -> assurance integration bridge.
-- Operational privacy records may propose scope/evidence work, but can never directly create assurance conclusions.

CREATE TYPE privacy_assurance_candidate_type AS ENUM ('SCOPE','EVIDENCE_REQUEST');
CREATE TYPE privacy_assurance_candidate_status AS ENUM ('PROPOSED','ACCEPTED','REJECTED');

CREATE TABLE privacy_assurance_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  engagement_id uuid NOT NULL,
  privacy_record_type text NOT NULL CHECK (privacy_record_type IN ('PROCESSING_ACTIVITY','DPIA','PROCESSOR','TRANSFER','RETENTION_RULE','NOTICE','CONSENT','DSR','BREACH','PRIVACY_ALERT')),
  privacy_record_id uuid NOT NULL,
  candidate_type privacy_assurance_candidate_type NOT NULL,
  suggested_title text NOT NULL CHECK (length(btrim(suggested_title)) > 0),
  rationale text NOT NULL CHECK (length(btrim(rationale)) > 0),
  suggested_evidence text,
  status privacy_assurance_candidate_status NOT NULL DEFAULT 'PROPOSED',
  proposed_by uuid NOT NULL REFERENCES users(id),
  proposed_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  decision_rationale text,
  scope_id uuid,
  pbc_request_id uuid REFERENCES pbc_requests(id),
  CONSTRAINT privacy_assurance_candidates_engagement_tenant_fk FOREIGN KEY (engagement_id, organization_id) REFERENCES engagements(id, organization_id),
  CONSTRAINT privacy_assurance_candidates_scope_fk FOREIGN KEY (scope_id, organization_id) REFERENCES scopes(id, organization_id),
  CONSTRAINT privacy_assurance_candidates_decision_ck CHECK (
    (status = 'PROPOSED' AND decided_by IS NULL AND decided_at IS NULL AND decision_rationale IS NULL AND scope_id IS NULL AND pbc_request_id IS NULL)
    OR (status = 'REJECTED' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND length(btrim(decision_rationale)) > 0 AND scope_id IS NULL AND pbc_request_id IS NULL)
    OR (status = 'ACCEPTED' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND length(btrim(decision_rationale)) > 0
        AND ((candidate_type = 'SCOPE' AND scope_id IS NOT NULL AND pbc_request_id IS NULL)
          OR (candidate_type = 'EVIDENCE_REQUEST' AND pbc_request_id IS NOT NULL AND scope_id IS NULL)))
  ),
  UNIQUE (engagement_id, privacy_record_type, privacy_record_id, candidate_type)
);

CREATE INDEX privacy_assurance_candidates_engagement_status_idx
  ON privacy_assurance_candidates(organization_id, engagement_id, status, candidate_type);

ALTER TABLE privacy_assurance_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_assurance_candidates FORCE ROW LEVEL SECURITY;
CREATE POLICY privacy_assurance_candidates_tenant_policy ON privacy_assurance_candidates
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

CREATE OR REPLACE FUNCTION privacy_record_exists_in_org(record_type text, record_id uuid, org_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  CASE record_type
    WHEN 'PROCESSING_ACTIVITY' THEN RETURN EXISTS (SELECT 1 FROM processing_activities WHERE id=record_id AND organization_id=org_id);
    WHEN 'DPIA' THEN RETURN EXISTS (SELECT 1 FROM dpia_assessments WHERE id=record_id AND organization_id=org_id);
    WHEN 'PROCESSOR' THEN RETURN EXISTS (SELECT 1 FROM processors WHERE id=record_id AND organization_id=org_id);
    WHEN 'TRANSFER' THEN RETURN EXISTS (SELECT 1 FROM international_transfers WHERE id=record_id AND organization_id=org_id);
    WHEN 'RETENTION_RULE' THEN RETURN EXISTS (SELECT 1 FROM retention_rules WHERE id=record_id AND organization_id=org_id);
    WHEN 'NOTICE' THEN RETURN EXISTS (SELECT 1 FROM privacy_notices WHERE id=record_id AND organization_id=org_id);
    WHEN 'CONSENT' THEN RETURN EXISTS (SELECT 1 FROM consent_records WHERE id=record_id AND organization_id=org_id);
    WHEN 'DSR' THEN RETURN EXISTS (SELECT 1 FROM data_subject_requests WHERE id=record_id AND organization_id=org_id);
    WHEN 'BREACH' THEN RETURN EXISTS (SELECT 1 FROM privacy_breaches WHERE id=record_id AND organization_id=org_id);
    WHEN 'PRIVACY_ALERT' THEN RETURN EXISTS (SELECT 1 FROM privacy_alerts WHERE id=record_id AND organization_id=org_id);
    ELSE RETURN false;
  END CASE;
END $$;

CREATE OR REPLACE FUNCTION validate_privacy_assurance_candidate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT privacy_record_exists_in_org(NEW.privacy_record_type, NEW.privacy_record_id, NEW.organization_id) THEN
    RAISE EXCEPTION 'Privacy source record does not exist in candidate organization';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id=NEW.organization_id AND m.user_id=NEW.proposed_by AND m.status='ACTIVE') THEN
    RAISE EXCEPTION 'Candidate proposer must be an active member of the organization';
  END IF;
  IF EXISTS (SELECT 1 FROM engagements e WHERE e.id=NEW.engagement_id AND e.frozen_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Cannot add privacy assurance candidates to a frozen engagement';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER privacy_assurance_candidate_source_guard
BEFORE INSERT OR UPDATE OF privacy_record_type, privacy_record_id, organization_id, engagement_id, proposed_by
ON privacy_assurance_candidates FOR EACH ROW EXECUTE FUNCTION validate_privacy_assurance_candidate();

CREATE OR REPLACE FUNCTION validate_privacy_assurance_decider(c privacy_assurance_candidates, actor_id uuid)
RETURNS void LANGUAGE plpgsql STABLE AS $$
BEGIN
  IF actor_id = c.proposed_by THEN RAISE EXCEPTION 'Candidate proposer cannot decide the same candidate'; END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id=c.organization_id AND m.user_id=actor_id AND m.status='ACTIVE') THEN
    RAISE EXCEPTION 'Candidate decider must be an active member of the organization';
  END IF;
END $$;

-- Human acceptance materializes a controlled assurance artifact. It never creates tests, exceptions, findings, risks, or conclusions.
CREATE OR REPLACE FUNCTION accept_privacy_assurance_candidate(candidate_id uuid, actor_id uuid, decision_reason text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE c privacy_assurance_candidates%ROWTYPE; created_id uuid;
BEGIN
  IF decision_reason IS NULL OR length(btrim(decision_reason)) = 0 THEN RAISE EXCEPTION 'Decision rationale is required'; END IF;
  SELECT * INTO c FROM privacy_assurance_candidates WHERE id=candidate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Privacy assurance candidate not found'; END IF;
  IF c.status <> 'PROPOSED' THEN RAISE EXCEPTION 'Only PROPOSED candidates may be accepted'; END IF;
  PERFORM validate_privacy_assurance_decider(c, actor_id);
  IF EXISTS (SELECT 1 FROM engagements WHERE id=c.engagement_id AND frozen_at IS NOT NULL) THEN RAISE EXCEPTION 'Frozen engagement cannot accept new assurance work'; END IF;

  IF c.candidate_type = 'SCOPE' THEN
    INSERT INTO scopes(engagement_id, organization_id, name, description, in_scope, scope_type, rationale)
    VALUES(c.engagement_id, c.organization_id, c.suggested_title, c.rationale, true, 'PRIVACY_OPERATION', decision_reason)
    RETURNING id INTO created_id;
    UPDATE privacy_assurance_candidates SET status='ACCEPTED', decided_by=actor_id, decided_at=now(), decision_rationale=decision_reason, scope_id=created_id WHERE id=c.id;
  ELSE
    INSERT INTO pbc_requests(engagement_id, requested_by, title, description, status, expected_evidence)
    VALUES(c.engagement_id, actor_id, c.suggested_title, c.rationale, 'OPEN', c.suggested_evidence)
    RETURNING id INTO created_id;
    UPDATE privacy_assurance_candidates SET status='ACCEPTED', decided_by=actor_id, decided_at=now(), decision_rationale=decision_reason, pbc_request_id=created_id WHERE id=c.id;
  END IF;

  INSERT INTO privacy_assurance_links(organization_id, engagement_id, privacy_record_type, privacy_record_id, rationale, linked_by)
  VALUES(c.organization_id, c.engagement_id, c.privacy_record_type, c.privacy_record_id, decision_reason, actor_id)
  ON CONFLICT (engagement_id, privacy_record_type, privacy_record_id) DO NOTHING;
  RETURN created_id;
END $$;

CREATE OR REPLACE FUNCTION reject_privacy_assurance_candidate(candidate_id uuid, actor_id uuid, decision_reason text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE c privacy_assurance_candidates%ROWTYPE;
BEGIN
  IF decision_reason IS NULL OR length(btrim(decision_reason)) = 0 THEN RAISE EXCEPTION 'Decision rationale is required'; END IF;
  SELECT * INTO c FROM privacy_assurance_candidates WHERE id=candidate_id FOR UPDATE;
  IF NOT FOUND OR c.status <> 'PROPOSED' THEN RAISE EXCEPTION 'Only an existing PROPOSED candidate may be rejected'; END IF;
  PERFORM validate_privacy_assurance_decider(c, actor_id);
  UPDATE privacy_assurance_candidates
    SET status='REJECTED', decided_by=actor_id, decided_at=now(), decision_rationale=decision_reason
  WHERE id=c.id;
END $$;

COMMENT ON TABLE privacy_assurance_candidates IS 'Human-reviewed bridge from operational privacy truth to audit scope/evidence work. Never an assurance conclusion.';
