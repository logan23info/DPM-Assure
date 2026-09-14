\set ON_ERROR_STOP on

BEGIN;

INSERT INTO organizations(id,name,slug) VALUES ('a0000000-0000-0000-0000-000000000001','Workflow Org','workflow-org');
INSERT INTO users(id,email,display_name) VALUES
 ('a1000000-0000-0000-0000-000000000001','creator@example.test','Creator'),
 ('a1000000-0000-0000-0000-000000000002','approver@example.test','Approver');
INSERT INTO memberships(organization_id,user_id,role) VALUES
 ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','ORG_ADMIN'),
 ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','ORG_ADMIN');

INSERT INTO processing_activities(id,organization_id,name,purpose,controller_processor_role,created_by)
VALUES ('a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','HR processing','Employment administration','CONTROLLER','a1000000-0000-0000-0000-000000000001');

DO $$ BEGIN
  BEGIN
    UPDATE processing_activities SET state='ACTIVE' WHERE id='a2000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'expected activation without review metadata to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'expected activation%' THEN RAISE; END IF;
  END;
END $$;

UPDATE processing_activities
SET reviewed_by='a1000000-0000-0000-0000-000000000002', reviewed_at=now(), state='ACTIVE'
WHERE id='a2000000-0000-0000-0000-000000000001';

INSERT INTO dpia_assessments(id,organization_id,processing_activity_id,version,screening_rationale,decision,risk_summary,mitigation_summary,created_by)
VALUES ('a3000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001',1,'High risk processing','IN_PROGRESS','Risk summary','Mitigation summary','a1000000-0000-0000-0000-000000000001');

DO $$ BEGIN
  BEGIN
    UPDATE dpia_assessments SET decision='APPROVED',approved_by='a1000000-0000-0000-0000-000000000001',approved_at=now()
    WHERE id='a3000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'expected self-approval to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'expected self-approval%' THEN RAISE; END IF;
  END;
END $$;

UPDATE dpia_assessments SET decision='APPROVED',approved_by='a1000000-0000-0000-0000-000000000002',approved_at=now()
WHERE id='a3000000-0000-0000-0000-000000000001';

INSERT INTO processors(id,organization_id,name,service_description,contract_reference,dpa_reference,security_review_status,created_by)
VALUES ('a4000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Payroll Vendor','Payroll service','CTR-1','DPA-1','APPROVED','a1000000-0000-0000-0000-000000000001');

DO $$ BEGIN
  BEGIN
    UPDATE processors SET status='ACTIVE' WHERE id='a4000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'expected processor activation without due diligence to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'expected processor activation%' THEN RAISE; END IF;
  END;
END $$;

UPDATE processors SET status='ACTIVE',due_diligence_completed_at=now(),approved_by='a1000000-0000-0000-0000-000000000002',approved_at=now()
WHERE id='a4000000-0000-0000-0000-000000000001';

INSERT INTO international_transfers(id,organization_id,processing_activity_id,processor_id,destination_country,mechanism,mechanism_reference,transfer_risk_assessment_reference,created_by)
VALUES ('a5000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','Exampleland','SCC','SCC-REF','TIA-REF','a1000000-0000-0000-0000-000000000001');
UPDATE international_transfers SET state='UNDER_REVIEW' WHERE id='a5000000-0000-0000-0000-000000000001';
UPDATE international_transfers SET state='ACTIVE',approved_by='a1000000-0000-0000-0000-000000000002',approved_at=now()
WHERE id='a5000000-0000-0000-0000-000000000001';

INSERT INTO data_subject_requests(id,organization_id,request_type,subject_reference_hash,received_at,due_at,status,created_by)
VALUES ('a6000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','ACCESS',repeat('a',64),now()-interval '10 day',now()-interval '1 day','RECEIVED','a1000000-0000-0000-0000-000000000001');

DO $$ BEGIN
  IF NOT dsr_is_overdue('a6000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'expected overdue DSR predicate to be true';
  END IF;
  BEGIN
    UPDATE data_subject_requests SET status='IN_PROGRESS' WHERE id='a6000000-0000-0000-0000-000000000001';
    RAISE EXCEPTION 'expected invalid DSR transition to fail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'expected invalid DSR%' THEN RAISE; END IF;
  END;
END $$;

UPDATE data_subject_requests SET status='IDENTITY_VERIFICATION' WHERE id='a6000000-0000-0000-0000-000000000001';
UPDATE data_subject_requests SET status='IN_PROGRESS',identity_verified_at=now() WHERE id='a6000000-0000-0000-0000-000000000001';
UPDATE data_subject_requests SET status='COMPLETED',outcome='Provided access response',closed_at=now() WHERE id='a6000000-0000-0000-0000-000000000001';

INSERT INTO privacy_breaches(id,organization_id,title,detected_at,description,notification_required,notification_rationale,created_by)
VALUES ('a7000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Test incident',now(),'Incident description',false,'Below notification threshold','a1000000-0000-0000-0000-000000000001');
UPDATE privacy_breaches SET status='TRIAGE' WHERE id='a7000000-0000-0000-0000-000000000001';
UPDATE privacy_breaches SET status='INVESTIGATING' WHERE id='a7000000-0000-0000-0000-000000000001';
UPDATE privacy_breaches SET status='CONTAINED',containment_summary='Access revoked and credentials rotated' WHERE id='a7000000-0000-0000-0000-000000000001';
UPDATE privacy_breaches SET status='NOTIFICATION_ASSESSMENT' WHERE id='a7000000-0000-0000-0000-000000000001';
UPDATE privacy_breaches SET status='CLOSED' WHERE id='a7000000-0000-0000-0000-000000000001';

ROLLBACK;
SELECT 'DPM-Assure privacy operations workflow contract: PASS' AS result;
