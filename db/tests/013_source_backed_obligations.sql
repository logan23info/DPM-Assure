\set ON_ERROR_STOP on

BEGIN;

INSERT INTO organizations(id,name,slug) VALUES
 ('b0000000-0000-0000-0000-000000000001','Obligation Org A','obligation-org-a'),
 ('b0000000-0000-0000-0000-000000000002','Obligation Org B','obligation-org-b');
INSERT INTO users(id,email,display_name) VALUES
 ('b1000000-0000-0000-0000-000000000001','obligation-a@example.test','Obligation A'),
 ('b1000000-0000-0000-0000-000000000002','obligation-b@example.test','Obligation B');
INSERT INTO memberships(organization_id,user_id,role) VALUES
 ('b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','ORG_ADMIN'),
 ('b0000000-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000002','ORG_ADMIN');

INSERT INTO sources(
 id,source_id,authority,type,title,status,jurisdiction,source_url,effective_at,last_validated_at,validated_by,intended_use
) VALUES (
 'b2000000-0000-0000-0000-000000000001','TEST-LAW-1','Test Legislature','LAW','Test Privacy Law','ACTIVE','TEST-JURISDICTION','https://example.test/law',
 '2026-01-01T00:00:00Z','2026-01-02T00:00:00Z','b1000000-0000-0000-0000-000000000001','Behavioral contract only'),
 ('b2000000-0000-0000-0000-000000000002','TEST-LAW-2','Other Legislature','LAW','Other Test Law','ACTIVE','OTHER-JURISDICTION','https://example.test/other-law',
 '2026-01-01T00:00:00Z','2026-01-02T00:00:00Z','b1000000-0000-0000-0000-000000000001','Behavioral contract only');

INSERT INTO frameworks(id,framework_key,name,authority) VALUES
 ('b3000000-0000-0000-0000-000000000001','TEST-FW','Test Framework','Test Legislature');
INSERT INTO framework_versions(id,framework_id,version,source_id,effective_at,validated_at,validated_by) VALUES
 ('b3100000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','1.0','b2000000-0000-0000-0000-000000000001',
  '2026-01-01T00:00:00Z','2026-01-02T00:00:00Z','b1000000-0000-0000-0000-000000000001');
INSERT INTO requirements(id,framework_version_id,requirement_key,title,description,classification,section_reference) VALUES
 ('b3200000-0000-0000-0000-000000000001','b3100000-0000-0000-0000-000000000001','REQ-1','Test notification obligation','Behavioral test requirement','LEGAL_REQUIREMENT','Section 1');

INSERT INTO compliance_profiles(id,organization_id,name,jurisdiction,validated_by) VALUES
 ('b4000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','Primary profile','TEST-JURISDICTION','b1000000-0000-0000-0000-000000000001'),
 ('b4000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000002','Other profile','OTHER-JURISDICTION','b1000000-0000-0000-0000-000000000002');
INSERT INTO compliance_profile_facts(organization_id,profile_id,fact_key,fact_value,source_reference,validated_by) VALUES
 ('b0000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','ENTITY_ROLE','CONTROLLER','Validated organization profile','b1000000-0000-0000-0000-000000000001');

-- Rule provenance must match requirement -> framework version -> source.
DO $$
BEGIN
  BEGIN
    INSERT INTO obligation_rules(rule_key,version,requirement_id,source_id,jurisdiction,trigger_type,offset_value,offset_unit,effective_at,rationale,validated_by)
    VALUES ('TEST-WRONG-SOURCE',1,'b3200000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002','TEST-JURISDICTION','EVENT_OCCURRED',3,'DAYS','2026-01-01T00:00:00Z','Must fail source provenance','b1000000-0000-0000-0000-000000000001');
    RAISE EXCEPTION 'expected mismatched source to fail';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'expected mismatched source to fail' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO obligation_rules(
 id,rule_key,version,requirement_id,source_id,jurisdiction,trigger_type,offset_value,offset_unit,condition_facts,effective_at,rationale,validated_by
) VALUES (
 'b5000000-0000-0000-0000-000000000001','TEST-OBLIGATION',1,
 'b3200000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','TEST-JURISDICTION','EVENT_OCCURRED',3,'DAYS',
 '{"ENTITY_ROLE":"CONTROLLER"}'::jsonb,'2026-01-01T00:00:00Z','Behavioral test: source-backed three-day offset','b1000000-0000-0000-0000-000000000001');

SELECT evaluate_obligation_rule(
 'b4000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001');

DO $$
DECLARE d applicability_determinations%ROWTYPE;
BEGIN
  SELECT * INTO d FROM applicability_determinations
  WHERE profile_id='b4000000-0000-0000-0000-000000000001' AND obligation_rule_id='b5000000-0000-0000-0000-000000000001';
  IF d.result <> 'APPLICABLE' THEN RAISE EXCEPTION 'matching validated facts must produce APPLICABLE'; END IF;
  IF d.fact_snapshot->>'ENTITY_ROLE' <> 'CONTROLLER' THEN RAISE EXCEPTION 'applicability must preserve fact snapshot'; END IF;
END $$;

-- Jurisdiction mismatch is deterministic NOT_APPLICABLE.
SELECT evaluate_obligation_rule(
 'b4000000-0000-0000-0000-000000000002','b5000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002');
DO $$
DECLARE r applicability_result;
BEGIN
 SELECT result INTO r FROM applicability_determinations
 WHERE profile_id='b4000000-0000-0000-0000-000000000002' AND obligation_rule_id='b5000000-0000-0000-0000-000000000001';
 IF r <> 'NOT_APPLICABLE' THEN RAISE EXCEPTION 'jurisdiction mismatch must be NOT_APPLICABLE'; END IF;
END $$;

-- Matching jurisdiction but missing required facts must fail closed to REVIEW_REQUIRED, not NOT_APPLICABLE.
INSERT INTO compliance_profiles(id,organization_id,name,jurisdiction,validated_by) VALUES
 ('b4000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000001','Incomplete profile','TEST-JURISDICTION','b1000000-0000-0000-0000-000000000001');
SELECT evaluate_obligation_rule(
 'b4000000-0000-0000-0000-000000000003','b5000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001');
DO $$
DECLARE r applicability_result;
BEGIN
 SELECT result INTO r FROM applicability_determinations
 WHERE profile_id='b4000000-0000-0000-0000-000000000003' AND obligation_rule_id='b5000000-0000-0000-0000-000000000001';
 IF r <> 'REVIEW_REQUIRED' THEN RAISE EXCEPTION 'missing applicability facts must be REVIEW_REQUIRED'; END IF;
END $$;

-- Only APPLICABLE may materialize. Exact due date comes from stored offset, never from app guesswork.
SELECT materialize_obligation_instance(
 (SELECT id FROM applicability_determinations WHERE profile_id='b4000000-0000-0000-0000-000000000001' AND obligation_rule_id='b5000000-0000-0000-0000-000000000001'),
 '2026-09-01T10:00:00Z','b1000000-0000-0000-0000-000000000001');
DO $$
DECLARE o obligation_instances%ROWTYPE;
BEGIN
 SELECT * INTO o FROM obligation_instances WHERE organization_id='b0000000-0000-0000-0000-000000000001';
 IF o.due_at <> '2026-09-04T10:00:00Z'::timestamptz THEN RAISE EXCEPTION 'due_at must be deterministically derived from source-backed rule'; END IF;
 IF o.source_reference <> 'TEST-OBLIGATION:v1' THEN RAISE EXCEPTION 'obligation must preserve rule version reference'; END IF;
END $$;

DO $$
DECLARE d_id uuid;
BEGIN
 SELECT id INTO d_id FROM applicability_determinations
 WHERE profile_id='b4000000-0000-0000-0000-000000000003' AND obligation_rule_id='b5000000-0000-0000-0000-000000000001';
 BEGIN
   PERFORM materialize_obligation_instance(d_id,'2026-09-01T10:00:00Z','b1000000-0000-0000-0000-000000000001');
   RAISE EXCEPTION 'expected REVIEW_REQUIRED materialization to fail';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM = 'expected REVIEW_REQUIRED materialization to fail' THEN RAISE; END IF;
 END;
END $$;

-- Trigger timestamps outside the governed rule validity are rejected.
DO $$
DECLARE d_id uuid;
BEGIN
 SELECT id INTO d_id FROM applicability_determinations
 WHERE profile_id='b4000000-0000-0000-0000-000000000001' AND obligation_rule_id='b5000000-0000-0000-0000-000000000001';
 BEGIN
   PERFORM materialize_obligation_instance(d_id,'2025-12-31T23:00:00Z','b1000000-0000-0000-0000-000000000001');
   RAISE EXCEPTION 'expected pre-effective trigger to fail';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM = 'expected pre-effective trigger to fail' THEN RAISE; END IF;
 END;
END $$;

ROLLBACK;
SELECT 'DPM-Assure source-backed obligations contract: PASS' AS result;
