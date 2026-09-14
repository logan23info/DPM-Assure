\set ON_ERROR_STOP on

BEGIN;

INSERT INTO organizations(id,name,slug) VALUES ('c0000000-0000-0000-0000-000000000001','Monitoring Org','monitoring-org');
INSERT INTO users(id,email,display_name) VALUES ('c1000000-0000-0000-0000-000000000001','monitoring@example.test','Monitoring User');
INSERT INTO memberships(organization_id,user_id,role) VALUES ('c0000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','ORG_ADMIN');

INSERT INTO sources(id,source_id,authority,type,title,status,jurisdiction,source_url,effective_at,validated_by) VALUES
 ('c2000000-0000-0000-0000-000000000001','MON-SRC-1','Test Authority','LAW','Monitoring Source v1','ACTIVE','MON-JURISDICTION','https://example.test/mon-v1','2026-01-01T00:00:00Z','c1000000-0000-0000-0000-000000000001'),
 ('c2000000-0000-0000-0000-000000000002','MON-SRC-2','Test Authority','LAW','Monitoring Source v2','ACTIVE','MON-JURISDICTION','https://example.test/mon-v2','2026-08-01T00:00:00Z','c1000000-0000-0000-0000-000000000001');
INSERT INTO frameworks(id,framework_key,name,authority) VALUES ('c3000000-0000-0000-0000-000000000001','MON-FW','Monitoring Framework','Test Authority');
INSERT INTO framework_versions(id,framework_id,version,source_id,effective_at,validated_by) VALUES
 ('c3100000-0000-0000-0000-000000000001','c3000000-0000-0000-0000-000000000001','1.0','c2000000-0000-0000-0000-000000000001','2026-01-01T00:00:00Z','c1000000-0000-0000-0000-000000000001');
INSERT INTO requirements(id,framework_version_id,requirement_key,title,description,classification) VALUES
 ('c3200000-0000-0000-0000-000000000001','c3100000-0000-0000-0000-000000000001','MON-REQ','Monitoring requirement','Test requirement','LEGAL_REQUIREMENT');
INSERT INTO compliance_profiles(id,organization_id,name,jurisdiction,validated_by) VALUES
 ('c4000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Monitoring profile','MON-JURISDICTION','c1000000-0000-0000-0000-000000000001');
INSERT INTO obligation_rules(id,rule_key,version,requirement_id,source_id,jurisdiction,trigger_type,offset_value,offset_unit,effective_at,rationale,validated_by) VALUES
 ('c5000000-0000-0000-0000-000000000001','MON-RULE',1,'c3200000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001','MON-JURISDICTION','EVENT',1,'DAYS','2026-01-01T00:00:00Z','Monitoring contract rule','c1000000-0000-0000-0000-000000000001');

SELECT evaluate_obligation_rule('c4000000-0000-0000-0000-000000000001','c5000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001');
SELECT materialize_obligation_instance(
 (SELECT id FROM applicability_determinations WHERE profile_id='c4000000-0000-0000-0000-000000000001'),
 '2026-09-01T00:00:00Z','c1000000-0000-0000-0000-000000000001');

-- Before the governed due date no overdue alert exists.
SELECT refresh_compliance_alerts('c0000000-0000-0000-0000-000000000001','2026-09-01T12:00:00Z','c1000000-0000-0000-0000-000000000001');
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM compliance_alerts WHERE alert_type='OBLIGATION_OVERDUE') THEN
   RAISE EXCEPTION 'obligation must not alert before governed due date';
 END IF;
END $$;

-- After due date exactly one idempotent overdue alert is created.
SELECT refresh_compliance_alerts('c0000000-0000-0000-0000-000000000001','2026-09-03T00:00:00Z','c1000000-0000-0000-0000-000000000001');
SELECT refresh_compliance_alerts('c0000000-0000-0000-0000-000000000001','2026-09-03T00:00:00Z','c1000000-0000-0000-0000-000000000001');
DO $$ BEGIN
 IF (SELECT count(*) FROM compliance_alerts WHERE alert_type='OBLIGATION_OVERDUE') <> 1 THEN
   RAISE EXCEPTION 'overdue obligation alert must be idempotent';
 END IF;
END $$;

-- Source changes are append-only and fan out only to organizations with affected determinations.
INSERT INTO source_change_events(id,old_source_id,new_source_id,change_type,summary,effective_at,recorded_by) VALUES
 ('c6000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000001','c2000000-0000-0000-0000-000000000002','SUPERSEDED','Test source superseded','2026-08-01T00:00:00Z','c1000000-0000-0000-0000-000000000001');
SELECT materialize_source_change_impacts('c6000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001');
SELECT refresh_compliance_alerts('c0000000-0000-0000-0000-000000000001','2026-09-03T00:00:00Z','c1000000-0000-0000-0000-000000000001');

DO $$ BEGIN
 IF (SELECT count(*) FROM source_change_impacts WHERE source_change_event_id='c6000000-0000-0000-0000-000000000001') <> 1 THEN
   RAISE EXCEPTION 'source change must create one impact for affected determination/obligation lineage';
 END IF;
 IF (SELECT count(*) FROM compliance_alerts WHERE alert_type='SOURCE_CHANGE_IMPACT') <> 1 THEN
   RAISE EXCEPTION 'source change impact must create one compliance alert';
 END IF;
END $$;

DO $$ BEGIN
 BEGIN
   UPDATE source_change_events SET summary='tamper' WHERE id='c6000000-0000-0000-0000-000000000001';
   RAISE EXCEPTION 'expected append-only source change event mutation to fail';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM='expected append-only source change event mutation to fail' THEN RAISE; END IF;
 END;
END $$;

-- Alerts cannot jump directly from OPEN to RESOLVED.
DO $$ BEGIN
 BEGIN
   UPDATE compliance_alerts SET status='RESOLVED',resolved_by='c1000000-0000-0000-0000-000000000001',resolved_at=now()
   WHERE alert_type='OBLIGATION_OVERDUE';
   RAISE EXCEPTION 'expected invalid alert transition to fail';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM='expected invalid alert transition to fail' THEN RAISE; END IF;
 END;
END $$;

ROLLBACK;
SELECT 'DPM-Assure obligation monitoring and source impact contract: PASS' AS result;
