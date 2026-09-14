\set ON_ERROR_STOP on
BEGIN;

INSERT INTO organizations (id,name,slug)
VALUES ('b1000000-0000-4000-8000-000000000001','Closure Contract Org','closure-contract-org');

INSERT INTO users (id,email,display_name) VALUES
('b2000000-0000-4000-8000-000000000001','auditor@closure.test','Auditor'),
('b2000000-0000-4000-8000-000000000002','manager@closure.test','Manager'),
('b2000000-0000-4000-8000-000000000003','reviewer@closure.test','Reviewer');

INSERT INTO memberships (organization_id,user_id,role) VALUES
('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','AUDITOR'),
('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','AUDIT_MANAGER'),
('b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000003','REVIEWER');

INSERT INTO clients (id,organization_id,name)
VALUES ('b3000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Closure Client');

INSERT INTO engagements (id,organization_id,client_id,name,created_by)
VALUES ('b4000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','Closure Test Engagement','b2000000-0000-4000-8000-000000000002');

INSERT INTO workpapers (id,organization_id,engagement_id,title,prepared_by)
VALUES ('b5000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','Closure Workpaper','b2000000-0000-4000-8000-000000000001');

INSERT INTO procedures (id,workpaper_id,name,description,procedure_type,sequence)
VALUES ('b6000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','Closure procedure','Exercise finding closure rules','INSPECTION',1);

INSERT INTO evidence (
 id,organization_id,engagement_id,workpaper_id,procedure_id,filename,mime_type,size_bytes,storage_key,sha256,uploaded_by,source_description
) VALUES (
 'b7000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',
 'b5000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','closure.txt','text/plain',16,'closure/1',
 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','b2000000-0000-4000-8000-000000000001','Closure contract evidence'
);

INSERT INTO evidence_gate_results (
 id,evidence_id,gate_version,identity_status,provenance_status,integrity_status,authorization_status,applicability_status,temporal_status,
 completeness_status,overall_result,evaluated_by,rationale,chain_of_custody_status,procedure_id,evaluated_sha256
) VALUES (
 'b8000000-0000-4000-8000-000000000001','b7000000-0000-4000-8000-000000000001','EVID-GATE-1','PASS','PASS','PASS','PASS','PASS','PASS','PASS','PASS',
 'b2000000-0000-4000-8000-000000000003','All evidence dimensions pass','PASS','b6000000-0000-4000-8000-000000000001',
 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
);

INSERT INTO test_results (id,workpaper_id,procedure_id,evidence_gate_result_id,result,conclusion,tested_by)
VALUES
('b9000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','FAIL','Initial test failed','b2000000-0000-4000-8000-000000000001'),
('b9000000-0000-4000-8000-000000000002','b5000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','b8000000-0000-4000-8000-000000000001','PASS','Observation source test','b2000000-0000-4000-8000-000000000001');

INSERT INTO exceptions (id,organization_id,engagement_id,workpaper_id,test_result_id,description,severity,created_by)
VALUES ('ba000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',
'b5000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000001','Closure exception','HIGH','b2000000-0000-4000-8000-000000000001');

INSERT INTO findings (id,organization_id,engagement_id,exception_id,title,description,finding_type,created_by)
VALUES ('bb000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',
'ba000000-0000-4000-8000-000000000001','Remediation-path finding','Must be remediated and retested','CONTROL_DEFICIENCY','b2000000-0000-4000-8000-000000000001');

-- Closure is denied before either controlled path is satisfied.
DO $$ BEGIN
  BEGIN
    UPDATE findings SET status='CLOSED' WHERE id='bb000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'finding closed without closure evidence';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'finding closed without closure evidence%' THEN RAISE; END IF; END;
END $$;

INSERT INTO remediations (id,finding_id,owner_user_id,plan,status,target_date,completed_at,organization_id,engagement_id,completed_by)
VALUES ('bc000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',
'Correct the failed control','COMPLETED',current_date,now(),'b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001');

DO $$ BEGIN
  BEGIN
    INSERT INTO retests (finding_id,remediation_id,result,tested_by,conclusion,organization_id,engagement_id)
    VALUES ('bb000000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000001','PASS','b2000000-0000-4000-8000-000000000003',
      'Missing evidence must fail','b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'PASS retest without evidence unexpectedly succeeded';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'PASS retest without evidence unexpectedly succeeded%' THEN RAISE; END IF; END;
END $$;

INSERT INTO retests (id,finding_id,remediation_id,result,evidence_id,tested_by,conclusion,organization_id,engagement_id)
VALUES ('bd000000-0000-4000-8000-000000000001','bb000000-0000-4000-8000-000000000001','bc000000-0000-4000-8000-000000000001','PASS',
'b7000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000003','Remediation verified',
'b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001');

UPDATE findings SET status='CLOSED' WHERE id='bb000000-0000-4000-8000-000000000001';

-- Second finding proves the controlled risk-acceptance path.
INSERT INTO observations (id,organization_id,engagement_id,workpaper_id,test_result_id,observation_type,description,created_by)
VALUES ('be000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',
'b5000000-0000-4000-8000-000000000001','b9000000-0000-4000-8000-000000000002','CONTROL_DEFICIENCY','Accepted residual risk candidate','b2000000-0000-4000-8000-000000000001');

INSERT INTO findings (id,organization_id,engagement_id,observation_id,title,description,finding_type,created_by)
VALUES ('bf000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',
'be000000-0000-4000-8000-000000000001','Risk acceptance finding','Management may accept with independent approval','CONTROL_DEFICIENCY','b2000000-0000-4000-8000-000000000001');

INSERT INTO risk_acceptances (
 id,finding_id,accepted_by,rationale,accepted_at,expires_at,review_due_at,status,organization_id,engagement_id
) VALUES (
 'c0000000-0000-4000-8000-000000000001','bf000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002','Business accepts residual risk',now(),
 now()+interval '90 days',now()+interval '30 days','OPEN','b1000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001'
);

DO $$ BEGIN
  BEGIN
    UPDATE findings SET status='CLOSED' WHERE id='bf000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'finding closed with unapproved risk acceptance';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'finding closed with unapproved risk acceptance%' THEN RAISE; END IF; END;
END $$;

DO $$ BEGIN
  BEGIN
    UPDATE risk_acceptances SET approval_status='APPROVED',approved_by='b2000000-0000-4000-8000-000000000002',approved_at=now()
    WHERE id='c0000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'risk acceptance self-approval unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN NULL;
    WHEN raise_exception THEN IF SQLERRM LIKE 'risk acceptance self-approval unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

UPDATE risk_acceptances SET approval_status='APPROVED',approved_by='b2000000-0000-4000-8000-000000000003',approved_at=now()
WHERE id='c0000000-0000-4000-8000-000000000001';

UPDATE findings SET status='CLOSED' WHERE id='bf000000-0000-4000-8000-000000000001';

DO $$ BEGIN
  IF NOT remediation_is_verified('bb000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'verified remediation should be closure-ready'; END IF;
  IF NOT risk_acceptance_is_current('bf000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'approved current risk acceptance should be closure-ready'; END IF;
END $$;

ROLLBACK;
SELECT 'DPM-Assure remediation/risk acceptance/retest contract: PASS' AS result;
