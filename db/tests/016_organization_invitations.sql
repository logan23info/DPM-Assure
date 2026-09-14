\set ON_ERROR_STOP on

BEGIN;

INSERT INTO organizations(id,name,slug) VALUES
 ('a0000000-0000-0000-0000-000000000001','Invite Org','invite-org');
INSERT INTO users(id,email,display_name) VALUES
 ('a1000000-0000-0000-0000-000000000001','admin@example.test','Admin'),
 ('a1000000-0000-0000-0000-000000000002','invitee@example.test','Invitee'),
 ('a1000000-0000-0000-0000-000000000003','wrong@example.test','Wrong User');
INSERT INTO memberships(organization_id,user_id,role,status) VALUES
 ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','ORG_ADMIN','ACTIVE');

INSERT INTO organization_invitations(id,organization_id,email,role,token_hash,invited_by,expires_at)
VALUES (
 'a2000000-0000-0000-0000-000000000001',
 'a0000000-0000-0000-0000-000000000001',
 'invitee@example.test','AUDITOR',repeat('a',64),
 'a1000000-0000-0000-0000-000000000001',now()+interval '1 day'
);

-- Wrong authenticated email cannot accept.
SELECT set_config('app.user_id','a1000000-0000-0000-0000-000000000003',true);
SELECT set_config('app.organization_id','a0000000-0000-0000-0000-000000000001',true);
DO $$
BEGIN
  BEGIN
    PERFORM accept_organization_invitation(repeat('a',64)::char(64));
    RAISE EXCEPTION 'expected wrong-email acceptance to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='expected wrong-email acceptance to fail' THEN RAISE; END IF;
  END;
END $$;

-- Correct authenticated user accepts exactly once.
SELECT set_config('app.user_id','a1000000-0000-0000-0000-000000000002',true);
SELECT set_config('app.organization_id','a0000000-0000-0000-0000-000000000001',true);
SELECT accept_organization_invitation(repeat('a',64)::char(64));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM memberships
     WHERE organization_id='a0000000-0000-0000-0000-000000000001'
       AND user_id='a1000000-0000-0000-0000-000000000002'
       AND role='AUDITOR' AND status='ACTIVE'
  ) THEN RAISE EXCEPTION 'accepted invite did not create membership'; END IF;

  BEGIN
    PERFORM accept_organization_invitation(repeat('a',64)::char(64));
    RAISE EXCEPTION 'expected invitation replay to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='expected invitation replay to fail' THEN RAISE; END IF;
  END;
END $$;

-- Expired invite cannot be accepted.
INSERT INTO organization_invitations(id,organization_id,email,role,token_hash,invited_by,invited_at,expires_at)
VALUES (
 'a2000000-0000-0000-0000-000000000002',
 'a0000000-0000-0000-0000-000000000001',
 'wrong@example.test','VIEWER',repeat('b',64),
 'a1000000-0000-0000-0000-000000000001',now()-interval '2 days',now()-interval '1 day'
);
SELECT set_config('app.user_id','a1000000-0000-0000-0000-000000000003',true);
DO $$
BEGIN
  BEGIN
    PERFORM accept_organization_invitation(repeat('b',64)::char(64));
    RAISE EXCEPTION 'expected expired invite to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='expected expired invite to fail' THEN RAISE; END IF;
  END;
END $$;

-- SUPER_ADMIN cannot be granted through organization invitation.
INSERT INTO organization_invitations(id,organization_id,email,role,token_hash,invited_by,expires_at)
VALUES (
 'a2000000-0000-0000-0000-000000000003',
 'a0000000-0000-0000-0000-000000000001',
 'wrong@example.test','SUPER_ADMIN',repeat('c',64),
 'a1000000-0000-0000-0000-000000000001',now()+interval '1 day'
);
DO $$
BEGIN
  BEGIN
    PERFORM accept_organization_invitation(repeat('c',64)::char(64));
    RAISE EXCEPTION 'expected SUPER_ADMIN invite to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='expected SUPER_ADMIN invite to fail' THEN RAISE; END IF;
  END;
END $$;

-- Last active ORG_ADMIN cannot be demoted or deactivated.
DO $$
BEGIN
  BEGIN
    UPDATE memberships SET role='VIEWER'
     WHERE organization_id='a0000000-0000-0000-0000-000000000001'
       AND user_id='a1000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'expected last admin demotion to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='expected last admin demotion to fail' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
SELECT 'DPM-Assure organization invitation contract: PASS' AS result;
