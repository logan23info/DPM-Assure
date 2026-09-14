\set ON_ERROR_STOP on

BEGIN;

INSERT INTO organizations(id,name,slug,status)
VALUES
 ('f0000000-0000-4000-8000-000000000001','Membership Discovery A','membership-discovery-a','ACTIVE'),
 ('f0000000-0000-4000-8000-000000000002','Membership Discovery B','membership-discovery-b','ACTIVE');

INSERT INTO users(id,email,display_name,status)
VALUES
 ('f0000000-0000-4000-8000-000000000011','membership-a@example.test','Membership A','ACTIVE'),
 ('f0000000-0000-4000-8000-000000000012','membership-b@example.test','Membership B','ACTIVE');

INSERT INTO memberships(organization_id,user_id,role,status)
VALUES
 ('f0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000011','ORG_ADMIN','ACTIVE'),
 ('f0000000-0000-4000-8000-000000000002','f0000000-0000-4000-8000-000000000012','VIEWER','ACTIVE');

INSERT INTO auth_sessions(id,user_id,token_hash,expires_at)
VALUES(
 'f0000000-0000-4000-8000-000000000021',
 'f0000000-0000-4000-8000-000000000011',
 encode(digest('membership-bootstrap-session-token-abcdefghijklmnopqrstuvwxyz','sha256'),'hex'),
 now()+interval '1 hour'
);

DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c
  FROM auth_resolve_session(encode(digest('membership-bootstrap-session-token-abcdefghijklmnopqrstuvwxyz','sha256'),'hex')::char(64));
  IF c <> 1 THEN RAISE EXCEPTION 'expected valid session bootstrap row, got %', c; END IF;

  IF EXISTS (
    SELECT 1 FROM auth_resolve_session(repeat('0',64)::char(64))
  ) THEN RAISE EXCEPTION 'unknown session hash must not resolve'; END IF;
END $$;

SELECT set_config('app.user_id','f0000000-0000-4000-8000-000000000011',true);

DO $$
DECLARE c integer;
BEGIN
  SELECT count(*) INTO c FROM auth_current_user_memberships();
  IF c <> 1 THEN RAISE EXCEPTION 'expected exactly one membership, got %', c; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth_current_user_memberships()
    WHERE organization_id='f0000000-0000-4000-8000-000000000001'::uuid
      AND role='ORG_ADMIN'::membership_role
  ) THEN RAISE EXCEPTION 'authenticated membership was not returned'; END IF;
  IF EXISTS (
    SELECT 1 FROM auth_current_user_memberships()
    WHERE organization_id='f0000000-0000-4000-8000-000000000002'::uuid
  ) THEN RAISE EXCEPTION 'membership discovery leaked another user organization'; END IF;
END $$;

SELECT set_config('app.user_id','',true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM auth_current_user_memberships()) THEN
    RAISE EXCEPTION 'membership discovery must return no rows without authenticated user context';
  END IF;
END $$;

ROLLBACK;
