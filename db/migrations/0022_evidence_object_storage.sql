-- DPM-Assure forward-only migration: private evidence object upload intents.
-- Browser uploads receive only short-lived provider URLs; evidence truth is established only after server-side retrieval and hashing.

CREATE TYPE evidence_upload_intent_status AS ENUM ('PENDING','FINALIZED','CANCELLED','EXPIRED');

CREATE TABLE evidence_upload_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  engagement_id uuid NOT NULL,
  workpaper_id uuid NOT NULL REFERENCES workpapers(id),
  procedure_id uuid REFERENCES procedures(id),
  pbc_request_id uuid REFERENCES pbc_requests(id),
  filename text NOT NULL,
  mime_type text NOT NULL,
  expected_size_bytes bigint NOT NULL CHECK (expected_size_bytes >= 0),
  storage_key text NOT NULL,
  status evidence_upload_intent_status NOT NULL DEFAULT 'PENDING',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  finalized_at timestamptz,
  evidence_id uuid REFERENCES evidence(id),
  CONSTRAINT evidence_upload_intents_engagement_tenant_fk
    FOREIGN KEY (engagement_id, organization_id) REFERENCES engagements(id, organization_id),
  CONSTRAINT evidence_upload_intents_expiry_ck CHECK (expires_at > created_at),
  CONSTRAINT evidence_upload_intents_status_shape_ck CHECK (
    (status = 'FINALIZED' AND evidence_id IS NOT NULL AND finalized_at IS NOT NULL)
    OR (status <> 'FINALIZED' AND evidence_id IS NULL AND finalized_at IS NULL)
  ),
  UNIQUE (organization_id, storage_key)
);

CREATE INDEX evidence_upload_intents_org_engagement_status_idx
  ON evidence_upload_intents(organization_id, engagement_id, status, expires_at);

CREATE OR REPLACE FUNCTION enforce_evidence_upload_intent_lineage()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  wp_engagement uuid;
  wp_org uuid;
  procedure_workpaper uuid;
  pbc_engagement uuid;
  pbc_workpaper uuid;
BEGIN
  SELECT engagement_id, organization_id INTO wp_engagement, wp_org
  FROM workpapers WHERE id = NEW.workpaper_id;
  IF wp_engagement IS DISTINCT FROM NEW.engagement_id OR wp_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Evidence upload intent workpaper must belong to the same tenant and engagement';
  END IF;

  IF NEW.procedure_id IS NOT NULL THEN
    SELECT workpaper_id INTO procedure_workpaper FROM procedures WHERE id = NEW.procedure_id;
    IF procedure_workpaper IS DISTINCT FROM NEW.workpaper_id THEN
      RAISE EXCEPTION 'Evidence upload intent procedure must belong to the selected workpaper';
    END IF;
  END IF;

  IF NEW.pbc_request_id IS NOT NULL THEN
    SELECT engagement_id, workpaper_id INTO pbc_engagement, pbc_workpaper
    FROM pbc_requests WHERE id = NEW.pbc_request_id;
    IF pbc_engagement IS DISTINCT FROM NEW.engagement_id THEN
      RAISE EXCEPTION 'Evidence upload intent PBC request must belong to the same engagement';
    END IF;
    IF pbc_workpaper IS NOT NULL AND pbc_workpaper IS DISTINCT FROM NEW.workpaper_id THEN
      RAISE EXCEPTION 'Evidence upload intent PBC request must match the selected workpaper';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_evidence_upload_intent_lineage
BEFORE INSERT OR UPDATE ON evidence_upload_intents
FOR EACH ROW EXECUTE FUNCTION enforce_evidence_upload_intent_lineage();

CREATE OR REPLACE FUNCTION protect_finalized_evidence_upload_intent()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'FINALIZED' THEN
    RAISE EXCEPTION 'Finalized evidence upload intent is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER trg_protect_finalized_evidence_upload_intent
BEFORE UPDATE OR DELETE ON evidence_upload_intents
FOR EACH ROW EXECUTE FUNCTION protect_finalized_evidence_upload_intent();

ALTER TABLE evidence_upload_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_upload_intents FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_upload_intents_tenant ON evidence_upload_intents
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

CREATE TRIGGER evidence_upload_intents_frozen_guard
BEFORE INSERT OR UPDATE OR DELETE ON evidence_upload_intents
FOR EACH ROW EXECUTE FUNCTION reject_frozen_child_mutation();

COMMENT ON TABLE evidence_upload_intents IS 'Short-lived private object upload authorization. It never constitutes evidence until server-side object verification and evidence registration complete.';
