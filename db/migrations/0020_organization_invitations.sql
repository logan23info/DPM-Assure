-- DPM-Assure governed organization user onboarding.
-- Invitation is not membership. Acceptance requires an authenticated active user whose email
-- matches the invited address; only then is membership created/activated.

CREATE TYPE organization_invitation_status AS ENUM ('PENDING','ACCEPTED','CANCELLED','EXPIRED');

CREATE TABLE organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  email text NOT NULL,
  role membership_role NOT NULL,
  token_hash char(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status organization_invitation_status NOT NULL DEFAULT 'PENDING',
  invited_by uuid NOT NULL REFERENCES users(id),
  invited_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES users(id),
  accepted_at timestamptz,
  cancelled_by uuid REFERENCES users(id),
  cancelled_at timestamptz,
  CHECK (expires_at > invited_at),
  CHECK (
    (status='PENDING' AND accepted_by IS NULL AND accepted_at IS NULL AND cancelled_by IS NULL AND cancelled_at IS NULL)
    OR (status='ACCEPTED' AND accepted_by IS NOT NULL AND accepted_at IS NOT NULL AND cancelled_by IS NULL AND cancelled_at IS NULL)
    OR (status='CANCELLED' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND accepted_by IS NULL AND accepted_at IS NULL)
    OR (status='EXPIRED' AND accepted_by IS NULL AND accepted_at IS NULL AND cancelled_by IS NULL AND cancelled_at IS NULL)
  )
);

CREATE UNIQUE INDEX organization_invitations_pending_email_uq
  ON organization_invitations(organization_id, lower(email))
  WHERE status='PENDING';
CREATE INDEX organization_invitations_org_status_idx
  ON organization_invitations(organization_id,status,expires_at);

ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
-- NO FORCE is intentional: the schema-owner SECURITY DEFINER acceptance function must be able
-- to inspect a pending invite before the user is a member. Runtime remains a non-owner and is
-- still subject to RLS for every direct table access.
ALTER TABLE organization_invitations NO FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_invitations_tenant_policy ON organization_invitations
  USING (organization_id=app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id=app_current_organization_id() AND app_is_current_org_member());

CREATE OR REPLACE FUNCTION accept_organization_invitation(p_token_hash char(64))
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_inv organization_invitations%ROWTYPE;
  v_user users%ROWTYPE;
  v_user_id uuid := app_current_user_id();
  v_org_id uuid := app_current_organization_id();
  v_membership_id uuid;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Authenticated user and organization context are required';
  END IF;

  SELECT * INTO v_user FROM users WHERE id=v_user_id AND status='ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Authenticated user is inactive or missing'; END IF;

  SELECT * INTO v_inv
    FROM organization_invitations
   WHERE token_hash=p_token_hash
     AND organization_id=v_org_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF v_inv.status <> 'PENDING' THEN RAISE EXCEPTION 'Invitation is not pending'; END IF;
  IF v_inv.expires_at <= now() THEN RAISE EXCEPTION 'Invitation has expired'; END IF;
  IF lower(v_inv.email) <> lower(v_user.email) THEN
    RAISE EXCEPTION 'Authenticated email does not match invitation';
  END IF;
  IF v_inv.role='SUPER_ADMIN' THEN
    RAISE EXCEPTION 'SUPER_ADMIN cannot be granted through organization invitation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM memberships m
     WHERE m.organization_id=v_inv.organization_id
       AND m.user_id=v_user.id
       AND m.status='ACTIVE'
  ) THEN
    RAISE EXCEPTION 'User is already an active organization member';
  END IF;

  INSERT INTO memberships(organization_id,user_id,role,status)
  VALUES (v_inv.organization_id,v_user.id,v_inv.role,'ACTIVE')
  ON CONFLICT (organization_id,user_id)
  DO UPDATE SET role=EXCLUDED.role,status='ACTIVE',updated_at=now()
  RETURNING id INTO v_membership_id;

  UPDATE organization_invitations
     SET status='ACCEPTED',accepted_by=v_user.id,accepted_at=now()
   WHERE id=v_inv.id;

  RETURN v_membership_id;
END $$;

CREATE OR REPLACE FUNCTION cancel_organization_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE v_actor uuid := app_current_user_id();
BEGIN
  UPDATE organization_invitations
     SET status='CANCELLED',cancelled_by=v_actor,cancelled_at=now()
   WHERE id=p_invitation_id
     AND organization_id=app_current_organization_id()
     AND status='PENDING';
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending invitation not found'; END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_membership_admin_safety()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.role='ORG_ADMIN' AND OLD.status='ACTIVE'
     AND (NEW.role<>'ORG_ADMIN' OR NEW.status<>'ACTIVE') THEN
    IF NOT EXISTS (
      SELECT 1 FROM memberships m
       WHERE m.organization_id=OLD.organization_id
         AND m.id<>OLD.id
         AND m.role='ORG_ADMIN' AND m.status='ACTIVE'
    ) THEN
      RAISE EXCEPTION 'Organization must retain at least one active ORG_ADMIN';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER memberships_admin_safety_guard
BEFORE UPDATE OF role,status ON memberships
FOR EACH ROW EXECUTE FUNCTION enforce_membership_admin_safety();

COMMENT ON TABLE organization_invitations IS 'Time-bounded, single-use organization membership invitations. Invitation is not membership.';
COMMENT ON FUNCTION accept_organization_invitation(char(64)) IS 'Accepts an invitation only when transaction-local authenticated user/org context matches the invited email and organization.';
