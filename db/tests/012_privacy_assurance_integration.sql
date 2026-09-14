\set ON_ERROR_STOP on

BEGIN;

INSERT INTO organizations(id,name,slug) VALUES
 ('a0000000-0000-0000-0000-000000000001','PAI Org A','pai-org-a'),
 ('a0000000-0000-0000-0000-000000000002','PAI Org B','pai-org-b');
INSERT INTO users(id,email,display_name) VALUES
 ('a1000000-0000-0000-0000-000000000001','pai-a@example.test','PAI A'),
 ('a1000000-0000-0000-0000-000000000002','pai-b@example.test','PAI B');
INSERT INTO memberships(organization_id,user_id,role) VALUES
 ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','ORG_ADMIN'),
 ('a0000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','ORG_ADMIN');
INSERT INTO clients(id,organization_id,name) VALUES
 ('a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Client A'),
 ('a2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002','Client B');
INSERT INTO engagements(id,organization_id,client_id,name,created_by) VALUES
 ('a3000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','Engagement A','a1000000-0000-0000-0000-000000000001'),
 ('a3000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','Engagement B','a1000000-0000-0000-0000-000000000002');
INSERT INTO processing_activities(id,organization_id,name,purpose,controller_processor_role,created_by)
VALUES ('a4000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Customer support','Support','CONTROLLER','a1000000-0000-0000-0000-000000000001');

-- Valid scope proposal.
INSERT INTO privacy_assurance_candidates(
 id,organization_id,engagement_id,privacy_record_type,privacy_record_id,candidate_type,suggested_title,rationale,proposed_by)
VALUES (
 'a5000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001',
 'PROCESSING_ACTIVITY','a4000000-0000-0000-0000-000000000001','SCOPE','Customer support processing','Operational processing activity should be considered for audit scope','a1000000-0000-0000-0000-000000000001');

DO $$
BEGIN
  BEGIN
    INSERT INTO privacy_assurance_candidates(organization_id,engagement_id,privacy_record_type,privacy_record_id,candidate_type,suggested_title,rationale,proposed_by)
    VALUES ('a0000000-0000-0000-0000-000000000002','a3000000-0000-0000-0000-000000000002','PROCESSING_ACTIVITY','a4000000-0000-0000-0000-000000000001','SCOPE','Cross tenant','Must fail','a1000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'expected cross-tenant privacy source to fail';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'expected cross-tenant privacy source to fail' THEN RAISE; END IF;
  END;
END $$;

SELECT accept_privacy_assurance_candidate(
 'a5000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Include processing activity in approved audit scope');

DO $$
DECLARE c privacy_assurance_candidates%ROWTYPE;
BEGIN
 SELECT * INTO c FROM privacy_assurance_candidates WHERE id='a5000000-0000-0000-0000-000000000001';
 IF c.status <> 'ACCEPTED' OR c.scope_id IS NULL OR c.pbc_request_id IS NOT NULL THEN
   RAISE EXCEPTION 'scope candidate acceptance did not materialize correctly';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM scopes WHERE id=c.scope_id AND scope_type='PRIVACY_OPERATION' AND in_scope=true) THEN
   RAISE EXCEPTION 'accepted scope candidate did not create governed scope';
 END IF;
 IF EXISTS (SELECT 1 FROM findings WHERE engagement_id=c.engagement_id) THEN
   RAISE EXCEPTION 'privacy integration must never auto-create findings';
 END IF;
END $$;

-- Evidence-request proposal becomes PBC, not evidence or conclusion.
INSERT INTO privacy_assurance_candidates(
 id,organization_id,engagement_id,privacy_record_type,privacy_record_id,candidate_type,suggested_title,rationale,suggested_evidence,proposed_by)
VALUES (
 'a5000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000001',
 'PROCESSING_ACTIVITY','a4000000-0000-0000-0000-000000000001','EVIDENCE_REQUEST','Provide processing inventory evidence','Evidence is needed to test the operational record','Current approved RoPA export','a1000000-0000-0000-0000-000000000001');
SELECT accept_privacy_assurance_candidate(
 'a5000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001','Request source evidence through PBC');

DO $$
DECLARE c privacy_assurance_candidates%ROWTYPE;
BEGIN
 SELECT * INTO c FROM privacy_assurance_candidates WHERE id='a5000000-0000-0000-0000-000000000002';
 IF c.status <> 'ACCEPTED' OR c.pbc_request_id IS NULL OR c.scope_id IS NOT NULL THEN RAISE EXCEPTION 'evidence candidate acceptance failed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pbc_requests WHERE id=c.pbc_request_id AND expected_evidence='Current approved RoPA export') THEN RAISE EXCEPTION 'PBC not materialized from evidence candidate'; END IF;
 IF EXISTS (SELECT 1 FROM evidence WHERE engagement_id=c.engagement_id) THEN RAISE EXCEPTION 'candidate acceptance must not fabricate evidence'; END IF;
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM accept_privacy_assurance_candidate('a5000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001','Duplicate decision');
    RAISE EXCEPTION 'expected duplicate acceptance to fail';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'expected duplicate acceptance to fail' THEN RAISE; END IF;
  END;
END $$;

ROLLBACK;
SELECT 'DPM-Assure privacy assurance integration contract: PASS' AS result;
