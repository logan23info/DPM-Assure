\set ON_ERROR_STOP on

DO $$
BEGIN
  IF to_regclass('public.processing_activities') IS NULL OR
     to_regclass('public.dpia_assessments') IS NULL OR
     to_regclass('public.processors') IS NULL OR
     to_regclass('public.international_transfers') IS NULL OR
     to_regclass('public.retention_rules') IS NULL OR
     to_regclass('public.privacy_notices') IS NULL OR
     to_regclass('public.consent_records') IS NULL OR
     to_regclass('public.data_subject_requests') IS NULL OR
     to_regclass('public.privacy_breaches') IS NULL OR
     to_regclass('public.privacy_assurance_links') IS NULL THEN
    RAISE EXCEPTION 'privacy operations foundation tables missing';
  END IF;
END $$;

DO $$
DECLARE t text; forced boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['processing_activities','dpia_assessments','processors','processing_activity_processors','international_transfers','retention_rules','privacy_notices','consent_records','data_subject_requests','privacy_breaches','privacy_assurance_links']
  LOOP
    SELECT relforcerowsecurity INTO forced FROM pg_class WHERE oid = to_regclass('public.' || t);
    IF forced IS DISTINCT FROM true THEN RAISE EXCEPTION 'RLS not forced for %', t; END IF;
  END LOOP;
END $$;

BEGIN;

INSERT INTO organizations(id,name,slug) VALUES
 ('90000000-0000-0000-0000-000000000001','Privacy Org A','privacy-org-a'),
 ('90000000-0000-0000-0000-000000000002','Privacy Org B','privacy-org-b');
INSERT INTO users(id,email,display_name) VALUES
 ('91000000-0000-0000-0000-000000000001','privacy-a@example.test','Privacy A'),
 ('91000000-0000-0000-0000-000000000002','privacy-b@example.test','Privacy B');
INSERT INTO memberships(organization_id,user_id,role) VALUES
 ('90000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001','ORG_ADMIN'),
 ('90000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000002','ORG_ADMIN');

-- Seed as owner; runtime RLS behavior is covered separately by the security contract.
INSERT INTO processing_activities(id,organization_id,name,purpose,controller_processor_role,created_by)
VALUES ('92000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','Customer support','Provide support','CONTROLLER','91000000-0000-0000-0000-000000000001');

INSERT INTO dpia_assessments(organization_id,processing_activity_id,version,screening_rationale,decision,created_by)
VALUES ('90000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001',1,'Initial screening','REQUIRED','91000000-0000-0000-0000-000000000001');

DO $$
BEGIN
  BEGIN
    INSERT INTO dpia_assessments(organization_id,processing_activity_id,version,screening_rationale,decision,created_by)
    VALUES ('90000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000001',2,'Cross tenant attempt','REQUIRED','91000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'expected cross-tenant DPIA relationship to fail';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO privacy_breaches(organization_id,title,detected_at,description,notification_required,created_by)
    VALUES ('90000000-0000-0000-0000-000000000001','Test breach',now(),'Test',true,'91000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'expected notification rationale constraint to fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO consent_records(organization_id,subject_reference_hash,purpose,status,captured_at)
    VALUES ('90000000-0000-0000-0000-000000000001',repeat('x',64),'Marketing','GIVEN',now());
    RAISE EXCEPTION 'expected invalid subject hash to fail';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

ROLLBACK;
SELECT 'DPM-Assure privacy operations foundation contract: PASS' AS result;
