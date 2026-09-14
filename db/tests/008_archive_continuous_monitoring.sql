\set ON_ERROR_STOP on
BEGIN;

INSERT INTO organizations (id,name,slug)
VALUES ('b1000000-0000-4000-8000-000000000001','Monitoring Org','monitoring-org');
INSERT INTO users (id,email,display_name) VALUES
('b2000000-0000-4000-8000-000000000001','prep@monitor.test','Preparer'),
('b2000000-0000-4000-8000-000000000002','review@monitor.test','Reviewer'),
('b2000000-0000-4000-8000-000000000003','manager@monitor.test','Manager');
INSERT INTO memberships (organization_id,user_id,role) VALUES
('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','AUDITOR'),
('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','REVIEWER'),
('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000003','AUDIT_MANAGER');
INSERT INTO clients (id,organization_id,name)
VALUES ('b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Monitoring Client');

INSERT INTO engagements (id,organization_id,client_id,name,status,created_by)
VALUES ('b4000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','Archived Baseline','REVIEW','b2000000-0000-4000-8000-000000000003');
INSERT INTO workpapers (id,organization_id,engagement_id,title,status,prepared_by)
VALUES ('b5000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','Baseline Workpaper','COMPLETED','b2000000-0000-4000-8000-000000000001');
INSERT INTO reviews (engagement_id,workpaper_id,reviewer_id,status,reviewed_at)
VALUES ('b4000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','APPROVED',now());
INSERT INTO reports (engagement_id,version,status,report_type,content,generated_by,approved_by,approved_at)
VALUES ('b4000000-0000-4000-8000-000000000001',1,'APPROVED','FINAL','{}'::jsonb,'b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000003',now());
INSERT INTO signoffs (engagement_id,reviewed_by,role,status,statement,signed_at)
VALUES ('b4000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','REVIEWER','APPROVED','Final assurance approved',now());
UPDATE engagements SET status='CLOSED' WHERE id='b4000000-0000-4000-8000-000000000001';
INSERT INTO audit_freezes (id,engagement_id,version,frozen_by,freeze_reason,snapshot_hash)
VALUES ('b6000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',1,'b2000000-0000-4000-8000-000000000003','Baseline freeze',repeat('c',64));

INSERT INTO engagement_archives (id,organization_id,engagement_id,audit_freeze_id,archived_by,archive_reason)
VALUES ('b7000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000003','Completed assurance baseline');

-- Archive records are append-only.
DO $$
BEGIN
  BEGIN
    UPDATE engagement_archives SET archive_reason='tampered' WHERE id='b7000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'archive mutation unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'archive mutation unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO monitoring_programs (id,organization_id,baseline_engagement_id,name,cadence_days,next_due_at,created_by)
VALUES ('b8000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','Quarterly privacy control monitoring',90,now()+interval '90 days','b2000000-0000-4000-8000-000000000003');
INSERT INTO monitoring_checks (id,organization_id,monitoring_program_id,result,summary,checked_by)
VALUES ('b9000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','CHANGE_DETECTED','Material system change detected','b2000000-0000-4000-8000-000000000002');
INSERT INTO change_events (id,organization_id,baseline_engagement_id,monitoring_check_id,change_type,description,detected_by)
VALUES ('ba000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','SYSTEM_CHANGE','New processing component changes the prior control environment','b2000000-0000-4000-8000-000000000002');

-- A frozen baseline cannot be reused as its own successor.
DO $$
BEGIN
  BEGIN
    INSERT INTO reassessments (organization_id,baseline_engagement_id,change_event_id,decision,rationale,assessed_by,successor_engagement_id)
    VALUES ('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','NEW_ENGAGEMENT','Material change requires new assurance','b2000000-0000-4000-8000-000000000003','b4000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'baseline reused as successor unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'baseline reused as successor unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO engagements (id,organization_id,client_id,name,status,created_by)
VALUES ('bb000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','Successor Reassessment Engagement','PLANNING','b2000000-0000-4000-8000-000000000003');
INSERT INTO reassessments (organization_id,baseline_engagement_id,change_event_id,decision,rationale,assessed_by,successor_engagement_id)
VALUES ('b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','ba000000-0000-4000-8000-000000000001','NEW_ENGAGEMENT','Material change requires a new controlled assurance cycle','b2000000-0000-4000-8000-000000000003','bb000000-0000-4000-8000-000000000001');

DO $$
DECLARE baseline_frozen timestamptz; successor_status engagement_status;
BEGIN
  SELECT frozen_at INTO baseline_frozen FROM engagements WHERE id='b4000000-0000-4000-8000-000000000001';
  SELECT status INTO successor_status FROM engagements WHERE id='bb000000-0000-4000-8000-000000000001';
  IF baseline_frozen IS NULL THEN RAISE EXCEPTION 'archived baseline lost frozen state'; END IF;
  IF successor_status <> 'PLANNING' THEN RAISE EXCEPTION 'successor engagement should begin in PLANNING'; END IF;
END $$;

ROLLBACK;
SELECT 'DPM-Assure archive/continuous-monitoring contract: PASS' AS result;