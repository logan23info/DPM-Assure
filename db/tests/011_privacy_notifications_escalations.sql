\set ON_ERROR_STOP on

BEGIN;

INSERT INTO organizations(id,name,slug) VALUES ('b0000000-0000-0000-0000-000000000001','Alert Org','alert-org');
INSERT INTO users(id,email,display_name) VALUES
 ('b1000000-0000-0000-0000-000000000001','owner@example.test','Owner'),
 ('b1000000-0000-0000-0000-000000000002','reviewer@example.test','Reviewer');
INSERT INTO memberships(organization_id,user_id,role) VALUES
 ('b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','ORG_ADMIN'),
 ('b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002','ORG_ADMIN');

INSERT INTO processing_activities(id,organization_id,name,purpose,controller_processor_role,state,owner_user_id,reviewed_by,reviewed_at,next_review_at,created_by)
VALUES ('b2000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Marketing','Campaigns','CONTROLLER','ACTIVE','b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002',now()-interval '1 year',now()-interval '1 day','b1000000-0000-0000-0000-000000000001');

INSERT INTO dpia_assessments(id,organization_id,processing_activity_id,version,screening_rationale,decision,risk_summary,mitigation_summary,approved_by,approved_at,next_review_at,created_by)
VALUES ('b3000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001',1,'Screened','APPROVED','Risk','Mitigation','b1000000-0000-0000-0000-000000000002',now()-interval '1 year',now()-interval '1 day','b1000000-0000-0000-0000-000000000001');

INSERT INTO processors(id,organization_id,name,service_description,status,contract_reference,dpa_reference,security_review_status,due_diligence_completed_at,approved_by,approved_at,next_review_at,owner_user_id,created_by)
VALUES ('b4000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Email Vendor','Email delivery','ACTIVE','CTR','DPA','APPROVED',now()-interval '1 year','b1000000-0000-0000-0000-000000000002',now()-interval '1 year',now()-interval '1 day','b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001');

INSERT INTO international_transfers(id,organization_id,processing_activity_id,processor_id,destination_country,mechanism,mechanism_reference,transfer_risk_assessment_reference,state,approved_by,approved_at,next_review_at,created_by)
VALUES ('b5000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','Exampleland','SCC','SCC','TIA','ACTIVE','b1000000-0000-0000-0000-000000000002',now()-interval '1 year',now()-interval '1 day','b1000000-0000-0000-0000-000000000001');

INSERT INTO data_subject_requests(id,organization_id,request_type,subject_reference_hash,received_at,due_at,status,assigned_to,created_by)
VALUES ('b6000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','ACCESS',repeat('b',64),now()-interval '20 day',now()-interval '1 day','RECEIVED','b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001');

INSERT INTO privacy_breaches(id,organization_id,title,detected_at,status,description,notification_required,notification_rationale,notification_due_at,notification_requirement_reference,owner_user_id,created_by)
VALUES ('b7000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Incident',now()-interval '5 day','INVESTIGATING','Incident',true,'Source-backed notification assessment',now()-interval '1 day','REQ-EXAMPLE','b1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001');

DO $$
DECLARE created_count integer;
BEGIN
  created_count := refresh_privacy_alerts('b0000000-0000-0000-0000-000000000001', now());
  IF created_count <> 6 THEN RAISE EXCEPTION 'expected 6 alerts, got %', created_count; END IF;
  created_count := refresh_privacy_alerts('b0000000-0000-0000-0000-000000000001', now());
  IF created_count <> 0 THEN RAISE EXCEPTION 'alert refresh must be idempotent; got % new rows', created_count; END IF;
END $$;

DO $$
DECLARE critical_count integer;
BEGIN
  SELECT count(*) INTO critical_count FROM privacy_alerts
  WHERE organization_id='b0000000-0000-0000-0000-000000000001' AND severity='CRITICAL';
  IF critical_count <> 2 THEN RAISE EXCEPTION 'expected 2 critical alerts, got %', critical_count; END IF;
END $$;

UPDATE privacy_alerts
SET status='ACKNOWLEDGED', acknowledged_by='b1000000-0000-0000-0000-000000000002', acknowledged_at=now()
WHERE record_type='DSR' AND record_id='b6000000-0000-0000-0000-000000000001';

UPDATE privacy_alerts
SET status='RESOLVED', resolved_by='b1000000-0000-0000-0000-000000000002', resolved_at=now()
WHERE record_type='DSR' AND record_id='b6000000-0000-0000-0000-000000000001';

DO $$ BEGIN
  BEGIN
    UPDATE privacy_alerts SET status='OPEN'
    WHERE record_type='DSR' AND record_id='b6000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'expected resolved alert reopen to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'expected resolved alert%' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
SELECT 'DPM-Assure privacy notifications/escalations contract: PASS' AS result;
