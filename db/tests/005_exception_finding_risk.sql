\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.observations') IS NULL THEN RAISE EXCEPTION 'observations table is missing'; END IF;
  IF to_regclass('public.risk_methodologies') IS NULL THEN RAISE EXCEPTION 'risk_methodologies table is missing'; END IF;
  IF to_regprocedure('public.calculate_risk_score(text,numeric,numeric)') IS NULL THEN RAISE EXCEPTION 'calculate_risk_score is missing'; END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='findings' AND column_name='risk_id'
  ) THEN RAISE EXCEPTION 'findings.risk_id should be removed to eliminate circular risk linkage'; END IF;
END $$;

INSERT INTO organizations (id,name,slug)
VALUES ('a1000000-0000-4000-8000-000000000001','Outcome Contract Org','outcome-contract-org');

INSERT INTO users (id,email,display_name) VALUES
('a2000000-0000-4000-8000-000000000001','tester@outcome.test','Tester'),
('a2000000-0000-4000-8000-000000000002','reviewer@outcome.test','Reviewer');

INSERT INTO memberships (organization_id,user_id,role) VALUES
('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','AUDITOR'),
('a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','REVIEWER');

INSERT INTO clients (id,organization_id,name)
VALUES ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Outcome Client');

INSERT INTO engagements (id,organization_id,client_id,name,created_by)
VALUES ('a4000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a3000000-0000-4000-8000-000000000001','Outcome Test Engagement','a2000000-0000-4000-8000-000000000001');

INSERT INTO workpapers (id,organization_id,engagement_id,title,prepared_by)
VALUES ('a5000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','Outcome Workpaper','a2000000-0000-4000-8000-000000000001');

INSERT INTO procedures (id,workpaper_id,name,description,procedure_type,sequence)
VALUES ('a6000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','Outcome procedure','Test outcome behavior','INSPECTION',1);

INSERT INTO evidence (
  id,organization_id,engagement_id,workpaper_id,procedure_id,filename,mime_type,size_bytes,storage_key,sha256,uploaded_by,source_description
) VALUES (
  'a7000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','outcome.txt','text/plain',12,
  'outcome/1','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','a2000000-0000-4000-8000-000000000001','Outcome contract evidence'
);

INSERT INTO evidence_gate_results (
  id,evidence_id,gate_version,identity_status,provenance_status,integrity_status,authorization_status,
  applicability_status,temporal_status,completeness_status,overall_result,evaluated_by,rationale,chain_of_custody_status,procedure_id,evaluated_sha256
) VALUES (
  'a8000000-0000-4000-8000-000000000001','a7000000-0000-4000-8000-000000000001','EVID-GATE-1',
  'PASS','PASS','PASS','PASS','PASS','PASS','PASS','PASS','a2000000-0000-4000-8000-000000000002','All evidence dimensions pass','PASS',
  'a6000000-0000-4000-8000-000000000001','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
);

INSERT INTO test_results (id,workpaper_id,procedure_id,evidence_gate_result_id,result,conclusion,tested_by)
VALUES
('a9000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001','PASS','Control operated as expected','a2000000-0000-4000-8000-000000000001'),
('a9000000-0000-4000-8000-000000000002','a5000000-0000-4000-8000-000000000001','a6000000-0000-4000-8000-000000000001','a8000000-0000-4000-8000-000000000001','FAIL','Control did not operate as expected','a2000000-0000-4000-8000-000000000001');

-- Exceptions are reserved for failed testing, not observations or notes on successful tests.
DO $$
BEGIN
  BEGIN
    INSERT INTO exceptions (organization_id,engagement_id,workpaper_id,test_result_id,description,severity,created_by)
    VALUES ('a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000001',
      'a9000000-0000-4000-8000-000000000001','Should not become an exception','LOW','a2000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'exception from PASS result unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'exception from PASS result unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO exceptions (id,organization_id,engagement_id,workpaper_id,test_result_id,description,severity,created_by)
VALUES ('aa000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001',
'a5000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000002','Failed test exception','HIGH','a2000000-0000-4000-8000-000000000001');

-- A PASS result may still carry an observation without being mislabeled as an exception.
INSERT INTO observations (
  id,organization_id,engagement_id,workpaper_id,test_result_id,observation_type,description,created_by
) VALUES (
  'ab000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','IMPROVEMENT_OPPORTUNITY','Improve supporting documentation','a2000000-0000-4000-8000-000000000001'
);

-- Formal findings must choose one primary source, not collapse observation and exception semantics.
DO $$
BEGIN
  BEGIN
    INSERT INTO findings (organization_id,engagement_id,exception_id,observation_id,title,description,finding_type,created_by)
    VALUES ('a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000001',
      'ab000000-0000-4000-8000-000000000001','Ambiguous finding','Both sources','CONTROL_DEFICIENCY','a2000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'finding with two primary sources unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
    WHEN raise_exception THEN IF SQLERRM LIKE 'finding with two primary sources unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO findings (id,organization_id,engagement_id,exception_id,title,description,finding_type,created_by)
VALUES ('ac000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001',
'aa000000-0000-4000-8000-000000000001','Failed control finding','Formalized failed test','CONTROL_DEFICIENCY','a2000000-0000-4000-8000-000000000001');

-- Risk score is methodology-derived, not caller-selected.
DO $$
BEGIN
  BEGIN
    INSERT INTO risks (organization_id,engagement_id,finding_id,likelihood,impact,score,method_version,rationale,assessed_by)
    VALUES ('a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000001',4,5,19,
      'DPM-RISK-MULTIPLICATIVE-1','Wrong score must fail','a2000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'non-deterministic risk score unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'non-deterministic risk score unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO risks (id,organization_id,engagement_id,finding_id,likelihood,impact,score,method_version,rationale,assessed_by)
VALUES ('ad000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a4000000-0000-4000-8000-000000000001',
'ac000000-0000-4000-8000-000000000001',4,5,20,'DPM-RISK-MULTIPLICATIVE-1','Deterministic risk score','a2000000-0000-4000-8000-000000000002');

DO $$
DECLARE score numeric;
BEGIN
  SELECT calculate_risk_score('DPM-RISK-MULTIPLICATIVE-1',4,5) INTO score;
  IF score <> 20 THEN RAISE EXCEPTION 'expected deterministic score 20, got %', score; END IF;
END $$;

ROLLBACK;
SELECT 'DPM-Assure exception/finding/risk behavioral contract: PASS' AS result;
