\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.engagement_assignments') IS NULL THEN RAISE EXCEPTION 'engagement_assignments table is missing'; END IF;
  IF to_regprocedure('public.engagement_independence_ready(uuid)') IS NULL THEN RAISE EXCEPTION 'engagement_independence_ready(uuid) is missing'; END IF;
  IF to_regprocedure('public.engagement_governance_ready(uuid)') IS NULL THEN RAISE EXCEPTION 'engagement_governance_ready(uuid) is missing'; END IF;
END $$;

INSERT INTO organizations (id, name, slug) VALUES ('10000000-0000-4000-8000-000000000001','Governance Test Org','governance-test-org');
INSERT INTO users (id,email,display_name) VALUES
('20000000-0000-4000-8000-000000000001','manager@example.test','Manager'),
('20000000-0000-4000-8000-000000000002','lead@example.test','Lead Auditor'),
('20000000-0000-4000-8000-000000000003','reviewer@example.test','Reviewer');
INSERT INTO memberships (organization_id,user_id,role) VALUES
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','AUDIT_MANAGER'),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','LEAD_AUDITOR'),
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','REVIEWER');
INSERT INTO clients (id,organization_id,name) VALUES ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Governance Test Client');
INSERT INTO engagements (id,organization_id,client_id,name,status,lead_auditor_id,created_by) VALUES ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Governance Gate Test','PLANNING','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001');
INSERT INTO engagement_assignments (engagement_id,user_id,assignment_role,assigned_by) VALUES ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','LEAD_AUDITOR','20000000-0000-4000-8000-000000000001');

DO $$ BEGIN
  BEGIN
    UPDATE engagements SET status='TESTING' WHERE id='40000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'PLANNING -> TESTING unexpectedly succeeded before governance gates';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'PLANNING -> TESTING unexpectedly succeeded%' THEN RAISE; END IF; END;
END $$;

INSERT INTO independence_checks (engagement_id,subject_user_id,result) VALUES ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','CLEAR');
INSERT INTO risk_assessments (engagement_id,method_version,inherent_score,control_score,residual_score,rationale,assessed_by) VALUES ('40000000-0000-4000-8000-000000000001','DPM-RISK-1',4,2,2,'Governance contract test risk assessment','20000000-0000-4000-8000-000000000002');
INSERT INTO audit_plans (engagement_id,version,status,objectives,scope_summary,sampling_approach,approved_by,approved_at,created_by) VALUES ('40000000-0000-4000-8000-000000000001',1,'APPROVED','Test governance readiness','Contract-test scope','Judgmental sample','20000000-0000-4000-8000-000000000003',now(),'20000000-0000-4000-8000-000000000002');

DO $$ BEGIN
  IF NOT engagement_independence_ready('40000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'independence gate should be ready'; END IF;
  IF NOT engagement_governance_ready('40000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'governance gate should be ready'; END IF;
END $$;

-- Satisfy the later framework/scope gate so this contract can isolate governance behavior.
INSERT INTO frameworks (id,framework_key,name,authority) VALUES ('50000000-0000-4000-8000-000000000001','TEST-FW','Test Framework','DPM Test');
INSERT INTO framework_versions (id,framework_id,version) VALUES ('51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','1.0');
INSERT INTO requirements (id,framework_version_id,requirement_key,title,description,classification) VALUES ('52000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','R1','Test requirement','Contract test requirement','AUDIT_CRITERION');
INSERT INTO engagement_frameworks (engagement_id,framework_version_id,applicability_status,organization_id,selected_by) VALUES ('40000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','SELECTED','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
INSERT INTO scopes (engagement_id,organization_id,name,scope_type,in_scope,rationale) VALUES ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Test boundary','SYSTEM',true,'Required for governance contract');
UPDATE engagement_requirement_applicability SET decision='APPLICABLE',rationale='Applies to test boundary',decided_by='20000000-0000-4000-8000-000000000002',decided_at=now() WHERE engagement_id='40000000-0000-4000-8000-000000000001';

UPDATE engagements SET status='TESTING' WHERE id='40000000-0000-4000-8000-000000000001';
DO $$ DECLARE current_status engagement_status; BEGIN
  SELECT status INTO current_status FROM engagements WHERE id='40000000-0000-4000-8000-000000000001';
  IF current_status <> 'TESTING' THEN RAISE EXCEPTION 'expected TESTING after gates, got %',current_status; END IF;
END $$;
ROLLBACK;
