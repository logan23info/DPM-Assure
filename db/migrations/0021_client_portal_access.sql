-- DPM-Assure client portal access boundary.
-- CLIENT organization membership is necessary but not sufficient: a user must also be explicitly mapped to a client entity.

CREATE TABLE client_user_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  client_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  status record_status NOT NULL DEFAULT 'ACTIVE',
  granted_by uuid NOT NULL REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_user_access_client_tenant_fk FOREIGN KEY (client_id, organization_id) REFERENCES clients(id, organization_id),
  CONSTRAINT client_user_access_client_user_uq UNIQUE (client_id, user_id)
);
CREATE INDEX client_user_access_org_user_idx ON client_user_access(organization_id, user_id, status);

CREATE OR REPLACE FUNCTION enforce_client_user_access_membership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id=NEW.organization_id AND m.user_id=NEW.user_id AND m.status='ACTIVE' AND m.role='CLIENT') THEN
    RAISE EXCEPTION 'Client portal access requires an active CLIENT membership in the same organization';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_user_access_membership_guard BEFORE INSERT OR UPDATE OF organization_id,user_id,status ON client_user_access FOR EACH ROW EXECUTE FUNCTION enforce_client_user_access_membership();

ALTER TABLE client_user_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_user_access FORCE ROW LEVEL SECURITY;
CREATE POLICY client_user_access_current_org ON client_user_access USING (organization_id=app_current_organization_id() AND app_is_current_org_member()) WITH CHECK (organization_id=app_current_organization_id() AND app_is_current_org_member());

CREATE OR REPLACE FUNCTION app_client_user_can_access(candidate_client_id uuid, candidate_user_id uuid DEFAULT app_current_user_id()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM client_user_access cua JOIN memberships m ON m.organization_id=cua.organization_id AND m.user_id=cua.user_id
    WHERE cua.organization_id=app_current_organization_id() AND cua.client_id=candidate_client_id AND cua.user_id=candidate_user_id
      AND cua.status='ACTIVE' AND m.status='ACTIVE' AND m.role='CLIENT'
  );
$$;

CREATE OR REPLACE FUNCTION enforce_pbc_client_assignee() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE engagement_org uuid; engagement_client uuid;
BEGIN
  IF NEW.assigned_to IS NULL THEN RETURN NEW; END IF;
  SELECT organization_id,client_id INTO engagement_org,engagement_client FROM engagements WHERE id=NEW.engagement_id;
  IF engagement_org IS NULL OR engagement_client IS NULL THEN RAISE EXCEPTION 'PBC engagement not found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM client_user_access cua JOIN memberships m ON m.organization_id=cua.organization_id AND m.user_id=cua.user_id
    WHERE cua.organization_id=engagement_org AND cua.client_id=engagement_client AND cua.user_id=NEW.assigned_to
      AND cua.status='ACTIVE' AND m.status='ACTIVE' AND m.role='CLIENT'
  ) THEN RAISE EXCEPTION 'PBC assignee must be an active CLIENT user mapped to the engagement client'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pbc_client_assignee_guard BEFORE INSERT OR UPDATE OF engagement_id,assigned_to ON pbc_requests FOR EACH ROW EXECUTE FUNCTION enforce_pbc_client_assignee();

CREATE TABLE client_pbc_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  pbc_request_id uuid NOT NULL REFERENCES pbc_requests(id),
  submitted_by uuid NOT NULL REFERENCES users(id),
  response_text text NOT NULL CHECK (length(btrim(response_text)) > 0),
  submitted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_pbc_responses_request_idx ON client_pbc_responses(pbc_request_id,submitted_at);
ALTER TABLE client_pbc_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_pbc_responses FORCE ROW LEVEL SECURITY;
CREATE POLICY client_pbc_responses_current_org ON client_pbc_responses USING (organization_id=app_current_organization_id() AND app_is_current_org_member()) WITH CHECK (organization_id=app_current_organization_id() AND app_is_current_org_member());

CREATE OR REPLACE FUNCTION enforce_client_pbc_response() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE request_org uuid; request_client uuid; request_assignee uuid;
BEGIN
  SELECT e.organization_id,e.client_id,p.assigned_to INTO request_org,request_client,request_assignee
  FROM pbc_requests p JOIN engagements e ON e.id=p.engagement_id WHERE p.id=NEW.pbc_request_id;
  IF request_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'PBC response tenant mismatch'; END IF;
  IF request_assignee IS DISTINCT FROM NEW.submitted_by THEN RAISE EXCEPTION 'Only the assigned client user may respond to this PBC request'; END IF;
  IF NOT EXISTS (SELECT 1 FROM client_user_access cua WHERE cua.organization_id=request_org AND cua.client_id=request_client AND cua.user_id=NEW.submitted_by AND cua.status='ACTIVE') THEN
    RAISE EXCEPTION 'PBC responder no longer has active access to the engagement client';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_pbc_response_guard BEFORE INSERT ON client_pbc_responses FOR EACH ROW EXECUTE FUNCTION enforce_client_pbc_response();

CREATE OR REPLACE FUNCTION reject_client_pbc_response_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'client PBC responses are append-only'; END $$;
CREATE TRIGGER client_pbc_responses_append_only BEFORE UPDATE OR DELETE ON client_pbc_responses FOR EACH ROW EXECUTE FUNCTION reject_client_pbc_response_mutation();

COMMENT ON TABLE client_user_access IS 'Explicit client-entity authorization for CLIENT users; organization membership alone never grants portal data access.';
COMMENT ON TABLE client_pbc_responses IS 'Append-only client responses to explicitly assigned PBC requests; does not expose internal workpapers or assurance conclusions.';
