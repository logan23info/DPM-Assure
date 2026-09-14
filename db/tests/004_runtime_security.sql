\set ON_ERROR_STOP on

-- Proves runtime behavior under a non-owner, non-BYPASSRLS application role.
-- This complements structural assertions by exercising isolation and mutation rejection.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dpm_contract_runtime') THEN
    EXECUTE 'DROP OWNED BY dpm_contract_runtime';
    EXECUTE 'DROP ROLE dpm_contract_runtime';
  END IF;
  CREATE ROLE dpm_contract_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
END $$;

GRANT USAGE ON SCHEMA public TO dpm_contract_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dpm_contract_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dpm_contract_runtime;

BEGIN;

INSERT INTO organizations (id,name,slug) VALUES
('91000000-0000-4000-8000-000000000001','Runtime Org A','runtime-org-a'),
('91000000-0000-4000-8000-000000000002','Runtime Org B','runtime-org-b');

INSERT INTO users (id,email,display_name) VALUES
('92000000-0000-4000-8000-000000000001','runtime-a@example.test','Runtime A'),
('92000000-0000-4000-8000-000000000002','runtime-b@example.test','Runtime B');

INSERT INTO memberships (organization_id,user_id,role) VALUES
('91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','AUDIT_MANAGER'),
('91000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002','AUDIT_MANAGER');

INSERT INTO clients (id,organization_id,name) VALUES
('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Client A'),
('93000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002','Client B');

INSERT INTO engagements (id,organization_id,client_id,name,created_by) VALUES
('94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Engagement A','92000000-0000-4000-8000-000000000001'),
('94000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000002','Engagement B','92000000-0000-4000-8000-000000000002');

INSERT INTO workpapers (id,organization_id,engagement_id,title,prepared_by) VALUES
('95000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','Runtime WP A','92000000-0000-4000-8000-000000000001');

INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,request_id,new_values)
VALUES ('96000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','runtime.test','engagement','94000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001','{"state":"created"}'::jsonb);

-- Runtime role sees only its selected tenant.
SET ROLE dpm_contract_runtime;
SELECT set_config('app.user_id','92000000-0000-4000-8000-000000000001',true);
SELECT set_config('app.organization_id','91000000-0000-4000-8000-000000000001',true);

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM engagements;
  IF n <> 1 THEN RAISE EXCEPTION 'RLS isolation failed: expected one visible engagement, got %', n; END IF;
  IF EXISTS (SELECT 1 FROM engagements WHERE id='94000000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'RLS isolation failed: tenant B engagement visible to tenant A';
  END IF;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO clients (organization_id,name) VALUES ('91000000-0000-4000-8000-000000000002','Cross Tenant Insert');
    RAISE EXCEPTION 'cross-tenant insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'cross-tenant insert unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;

-- Append-only audit history must reject mutation even for the schema owner.
DO $$
BEGIN
  BEGIN
    UPDATE audit_logs SET action='tampered' WHERE id='96000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'audit log update unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'audit log update unexpectedly succeeded%' THEN RAISE; END IF;
  END;

  BEGIN
    DELETE FROM audit_logs WHERE id='96000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'audit log delete unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'audit log delete unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

-- Frozen records must reject subsequent mutation.
UPDATE engagements SET frozen_at=now() WHERE id='94000000-0000-4000-8000-000000000001';
DO $$
BEGIN
  BEGIN
    UPDATE engagements SET name='Mutated after freeze' WHERE id='94000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'frozen engagement mutation unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'frozen engagement mutation unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

-- Invalid lifecycle transitions remain rejected independently of UI/application code.
DO $$
BEGIN
  BEGIN
    UPDATE engagements SET status='REVIEW' WHERE id='94000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'invalid PLANNING -> REVIEW transition unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'invalid PLANNING -> REVIEW transition unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

-- Cryptographic integrity fields reject malformed digests.
DO $$
BEGIN
  BEGIN
    INSERT INTO evidence (organization_id,engagement_id,workpaper_id,filename,mime_type,size_bytes,storage_key,sha256,uploaded_by)
    VALUES ('91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','bad.txt','text/plain',3,'runtime/bad','not-a-sha256','92000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'invalid evidence hash unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'invalid evidence hash unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
DROP OWNED BY dpm_contract_runtime;
DROP ROLE dpm_contract_runtime;

SELECT 'DPM-Assure runtime security behavioral contract: PASS' AS result;
