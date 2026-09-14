\set ON_ERROR_STOP on

DO $$ BEGIN
  IF to_regclass('public.client_user_access') IS NULL THEN RAISE EXCEPTION 'client_user_access table missing'; END IF;
END $$;

BEGIN;

INSERT INTO organizations(id,name,slug) VALUES
 ('a0000000-0000-0000-0000-000000000001','Portal Org','portal-org');
INSERT INTO users(id,email,display_name) VALUES
 ('a1000000-0000-0000-0000-000000000001','client@example.test','Client User'),
 ('a1000000-0000-0000-0000-000000000002','auditor@example.test','Auditor User'),
 ('a1000000-0000-0000-0000-000000000003','admin@example.test','Admin User');
INSERT INTO memberships(organization_id,user_id,role) VALUES
 ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','CLIENT'),
 ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','AUDITOR'),
 ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003','ORG_ADMIN');
INSERT INTO clients(id,organization_id,name) VALUES
 ('a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Client A'),
 ('a2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','Client B');

INSERT INTO client_user_access(organization_id,client_id,user_id,granted_by)
VALUES ('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000003');

PERFORM set_config('app.user_id','a1000000-0000-0000-0000-000000000001',true);
PERFORM set_config('app.organization_id','a0000000-0000-0000-0000-000000000001',true);

DO $$ BEGIN
  IF NOT app_client_user_can_access('a2000000-0000-0000-0000-000000000001'::uuid) THEN RAISE EXCEPTION 'mapped CLIENT should access Client A'; END IF;
  IF app_client_user_can_access('a2000000-0000-0000-0000-000000000002'::uuid) THEN RAISE EXCEPTION 'CLIENT must not access unmapped Client B'; END IF;
END $$;

DO $$ BEGIN
  BEGIN
    INSERT INTO client_user_access(organization_id,client_id,user_id,granted_by)
    VALUES ('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000003');
    RAISE EXCEPTION 'expected non-CLIENT mapping to fail';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'expected non-CLIENT mapping to fail' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
SELECT 'DPM-Assure client portal access contract: PASS' AS result;
