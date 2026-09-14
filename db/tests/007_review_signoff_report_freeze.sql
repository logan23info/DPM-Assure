\set ON_ERROR_STOP on
BEGIN;

INSERT INTO organizations (id,name,slug)
VALUES ('a1000000-0000-4000-8000-000000000001','Final Assurance Org','final-assurance-org');

INSERT INTO users (id,email,display_name) VALUES
('a2000000-0000-4000-8000-000000000001','preparer@final.test','Preparer'),
('a2000000-0000-4000-8000-000000000002','reviewer@final.test','Reviewer'),
('a2000000-0000-4000-8000-000000000003','manager@final.test','Audit Manager');

INSERT INTO memberships (organization_id,user_id,role) VALUES
('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','AUDITOR'),
('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','REVIEWER'),
('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003','AUDIT_MANAGER');

INSERT INTO clients (id,organization_id,name)
VALUES ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Final Client');

INSERT INTO engagements (id,organization_id,client_id,name,status,created_by)
VALUES ('a4000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','Final Assurance Engagement','REVIEW','a2000000-0000-4000-8000-000000000003');

INSERT INTO workpapers (id,organization_id,engagement_id,title,status,prepared_by)
VALUES ('a5000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','Final Workpaper','COMPLETED','a2000000-0000-4000-8000-000000000001');

-- REVIEW -> CLOSED must fail before final assurance gates are satisfied.
DO $$
BEGIN
  BEGIN
    UPDATE engagements SET status='CLOSED' WHERE id='a4000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'REVIEW -> CLOSED unexpectedly succeeded before final assurance gates';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'REVIEW -> CLOSED unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

-- Preparers cannot approve their own workpapers as independent reviewers.
DO $$
BEGIN
  BEGIN
    INSERT INTO reviews (engagement_id,workpaper_id,reviewer_id,status,reviewed_at)
    VALUES ('a4000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','APPROVED',now());
    RAISE EXCEPTION 'self-review unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'self-review unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO reviews (engagement_id,workpaper_id,reviewer_id,status,comments,reviewed_at)
VALUES ('a4000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','APPROVED','Independent QA review complete',now());

-- Report self-approval must be rejected by the approval shape constraint.
DO $$
BEGIN
  BEGIN
    INSERT INTO reports (engagement_id,version,status,report_type,content,generated_by,approved_by,approved_at)
    VALUES ('a4000000-0000-4000-8000-000000000001',1,'APPROVED','FINAL','{}'::jsonb,'a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001',now());
    RAISE EXCEPTION 'report self-approval unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'report self-approval unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO reports (id,engagement_id,version,status,report_type,content,generated_by,approved_by,approved_at)
VALUES ('a6000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001',1,'APPROVED','FINAL','{"opinion":"final"}'::jsonb,'a2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000003',now());

INSERT INTO signoffs (engagement_id,reviewed_by,role,status,statement,signed_at)
VALUES ('a4000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','REVIEWER','APPROVED','I independently reviewed the assurance record and approve finalization.',now());

DO $$
BEGIN
  IF NOT engagement_review_ready('a4000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'review gate should be ready'; END IF;
  IF NOT engagement_signoff_ready('a4000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'signoff gate should be ready'; END IF;
  IF NOT engagement_report_ready('a4000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'report gate should be ready'; END IF;
  IF NOT engagement_closure_ready('a4000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'closure gate should be ready'; END IF;
END $$;

UPDATE engagements SET status='CLOSED' WHERE id='a4000000-0000-4000-8000-000000000001';

-- Freeze version must be sequential.
DO $$
BEGIN
  BEGIN
    INSERT INTO audit_freezes (engagement_id,version,frozen_by,freeze_reason,snapshot_hash)
    VALUES ('a4000000-0000-4000-8000-000000000001',2,'a2000000-0000-4000-8000-000000000003','Invalid sequence',repeat('a',64));
    RAISE EXCEPTION 'non-sequential freeze version unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'non-sequential freeze version unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO audit_freezes (engagement_id,version,frozen_by,freeze_reason,snapshot_hash)
VALUES ('a4000000-0000-4000-8000-000000000001',1,'a2000000-0000-4000-8000-000000000003','Final assurance completed',repeat('b',64));

DO $$
DECLARE engagement_frozen timestamptz; workpaper_frozen timestamptz;
BEGIN
  SELECT frozen_at INTO engagement_frozen FROM engagements WHERE id='a4000000-0000-4000-8000-000000000001';
  SELECT frozen_at INTO workpaper_frozen FROM workpapers WHERE id='a5000000-0000-4000-8000-000000000001';
  IF engagement_frozen IS NULL THEN RAISE EXCEPTION 'engagement was not frozen'; END IF;
  IF workpaper_frozen IS NULL THEN RAISE EXCEPTION 'workpaper was not frozen'; END IF;
END $$;

-- Ordinary mutation of a child assurance record must be rejected after freeze.
DO $$
BEGIN
  BEGIN
    UPDATE reports SET content='{"tampered":true}'::jsonb WHERE id='a6000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'post-freeze report mutation unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'post-freeze report mutation unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
SELECT 'DPM-Assure review/signoff/report/freeze contract: PASS' AS result;