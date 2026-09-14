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
  CONSTRAINT client_user_access_client_tenant_fk
    FOREIGN KEY (client_id, organization_id) REFERENCES clients(id, organization_id),
  CONSTRAINT client_user_access_client_user_uq UNIQUE (client_id, user_id)
);

CREATE INDEX client_user_access_org_user_idx ON client_user_access(organization_id, user_id, status);

CREATE OR REPLACE FUNCTION enforce_client_user_access_membership()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = NEW.organization_id
      AND m.user_id = NEW.user_id
      AND m.status = 'ACTIVE'
      AND m.role = 'CLIENT'
  ) THEN
    RAISE EXCEPTION 'Client portal access requires an active CLIENT membership in the same organization';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER client_user_access_membership_guard
BEFORE INSERT OR UPDATE OF organization_id,user_id,status ON client_user_access
FOR EACH ROW EXECUTE FUNCTION enforce_client_user_access_membership();

ALTER TABLE client_user_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_user_access FORCE ROW LEVEL SECURITY;
CREATE POLICY client_user_access_current_org ON client_user_access
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

CREATE OR REPLACE FUNCTION app_client_user_can_access(candidate_client_id uuid, candidate_user_id uuid DEFAULT app_current_user_id())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM client_user_access cua
    JOIN memberships m
      ON m.organization_id = cua.organization_id
     AND m.user_id = cua.user_id
    WHERE cua.organization_id = app_current_organization_id()
      AND cua.client_id = candidate_client_id
      AND cua.user_id = candidate_user_id
      AND cua.status = 'ACTIVE'
      AND m.status = 'ACTIVE'
      AND m.role = 'CLIENT'
  );
$$;

CREATE OR REPLACE FUNCTION enforce_pbc_client_assignee()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  engagement_org uuid;
  engagement_client uuid;
BEGIN
  IF NEW.assigned_to IS NULL THEN RETURN NEW; END IF;

  SELECT organization_id, client_id INTO engagement_org, engagement_client
  FROM engagements WHERE id = NEW.engagement_id;

  IF engagement_org IS NULL OR engagement_client IS NULL THEN
    RAISE EXCEPTION 'PBC engagement not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM client_user_access cua
    JOIN memberships m ON m.organization_id = cua.organization_id AND m.user_id = cua.user_id
    WHERE cua.organization_id = engagement_org
      AND cua.client_id = engagement_client
      AND cua.user_id = NEW.assigned_to
      AND cua.status = 'ACTIVE'
      AND m.status = 'ACTIVE'
      AND m.role = 'CLIENT'
  ) THEN
    RAISE EXCEPTION 'PBC assignee must be an active CLIENT user mapped to the engagement client';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER pbc_client_assignee_guard
BEFORE INSERT OR UPDATE OF engagement_id,assigned_to ON pbc_requests
FOR EACH ROW EXECUTE FUNCTION enforce_pbc_client_assignee();

COMMENT ON TABLE client_user_access IS 'Explicit client-entity authorization for CLIENT users; organization membership alone never grants portal data access.';
COMMENT ON FUNCTION app_client_user_can_access(uuid,uuid) IS 'Returns true only for an active CLIENT membership explicitly mapped to the candidate client in the current organization.';
COMMENT ON FUNCTION enforce_pbc_client_assignee() IS 'Prevents assigning a PBC request to a client user who is not explicitly authorized for the engagement client.';
