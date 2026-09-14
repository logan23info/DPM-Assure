\set ON_ERROR_STOP on

BEGIN;

INSERT INTO organizations (id, name, slug)
VALUES ('11000000-0000-4000-8000-000000000001', 'Execution Test Org', 'execution-test-org');

INSERT INTO users (id, email, display_name)
VALUES
  ('21000000-0000-4000-8000-000000000001', 'manager-exec@example.test', 'Manager'),
  ('21000000-0000-4000-8000-000000000002', 'auditor-exec@example.test', 'Auditor'),
  ('21000000-0000-4000-8000-000000000003', 'reviewer-exec@example.test', 'Reviewer');

INSERT INTO clients (id, organization_id, name)
VALUES (
  '31000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'Execution Test Client'
);

INSERT INTO engagements (
  id, organization_id, client_id, name, status, created_by
)
VALUES (
  '41000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'Execution Lineage Test',
  'PLANNING',
  '21000000-0000-4000-8000-000000000001'
);

INSERT INTO frameworks (id, framework_key, name, authority)
VALUES ('51000000-0000-4000-8000-000000000001', 'EXEC-TEST', 'Execution Test Framework', 'Test Authority');

INSERT INTO framework_versions (id, framework_id, version)
VALUES (
  '52000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  '1.0'
);

INSERT INTO requirements (
  id, framework_version_id, requirement_key, title, description, classification
)
VALUES
  (
    '53000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',
    'REQ-1', 'Applicable requirement', 'Applicable requirement test', 'STANDARD_REQUIREMENT'
  ),
  (
    '53000000-0000-4000-8000-000000000002',
    '52000000-0000-4000-8000-000000000001',
    'REQ-2', 'Not applicable requirement', 'Negative requirement test', 'STANDARD_REQUIREMENT'
  );

INSERT INTO engagement_frameworks (
  id, engagement_id, framework_version_id, applicability_status, organization_id, selected_by
)
VALUES (
  '54000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  'IN_SCOPE',
  '11000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001'
);

UPDATE engagement_requirement_applicability
SET decision = CASE
      WHEN requirement_id = '53000000-0000-4000-8000-000000000001' THEN 'APPLICABLE'::applicability_decision
      ELSE 'NOT_APPLICABLE'::applicability_decision
    END,
    rationale = 'Behavioral contract decision',
    decided_by = '21000000-0000-4000-8000-000000000001',
    decided_at = now()
WHERE engagement_id = '41000000-0000-4000-8000-000000000001';

INSERT INTO scopes (
  id, engagement_id, organization_id, name, scope_type, in_scope, rationale
)
VALUES (
  '55000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'Primary system', 'SYSTEM', true, 'System processes personal data'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO samples (
      organization_id, engagement_id, requirement_id, scope_id,
      population_description, population_size, sampling_method, sample_size,
      selection_basis, created_by
    ) VALUES (
      '11000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-000000000001',
      '53000000-0000-4000-8000-000000000002',
      '55000000-0000-4000-8000-000000000001',
      'Invalid population', 10, 'RANDOM', 2,
      'Should fail', '21000000-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'non-applicable sample unexpectedly succeeded';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'non-applicable sample unexpectedly succeeded%' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO samples (
  id, organization_id, engagement_id, requirement_id, scope_id,
  population_description, population_size, sampling_method, sample_size,
  selection_basis, created_by
) VALUES (
  '56000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000001',
  '55000000-0000-4000-8000-000000000001',
  'Quarterly access reviews', 12, 'RANDOM', 2,
  'Representative quarterly selection',
  '21000000-0000-4000-8000-000000000002'
);

INSERT INTO sample_items (
  organization_id, engagement_id, sample_id, item_key, item_snapshot,
  selection_reason, selected_by
) VALUES
  (
    '11000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    '56000000-0000-4000-8000-000000000001',
    'Q1', '{"quarter":1}'::jsonb, 'Random selection',
    '21000000-0000-4000-8000-000000000002'
  ),
  (
    '11000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    '56000000-0000-4000-8000-000000000001',
    'Q4', '{"quarter":4}'::jsonb, 'Random selection',
    '21000000-0000-4000-8000-000000000002'
  );

UPDATE samples
SET review_status = 'APPROVED',
    reviewed_by = '21000000-0000-4000-8000-000000000003',
    reviewed_at = now(),
    review_rationale = 'Sample is sufficient for the stated objective'
WHERE id = '56000000-0000-4000-8000-000000000001';

DO $$
BEGIN
  BEGIN
    UPDATE samples SET selection_basis = 'Silent change'
    WHERE id = '56000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'approved sample unexpectedly mutated';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'approved sample unexpectedly mutated%' THEN RAISE; END IF;
  END;
END $$;

INSERT INTO workpapers (
  id, organization_id, engagement_id, title, prepared_by
) VALUES (
  '57000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  'Access review testing',
  '21000000-0000-4000-8000-000000000002'
);

INSERT INTO workpaper_sample_links (workpaper_id, sample_id, linked_by)
VALUES (
  '57000000-0000-4000-8000-000000000001',
  '56000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000002'
);

INSERT INTO workpaper_requirement_links (
  organization_id, engagement_id, workpaper_id, applicability_id,
  requirement_id, linked_by
)
SELECT
  '11000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000001',
  a.id,
  '53000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000002'
FROM engagement_requirement_applicability a
WHERE a.engagement_id = '41000000-0000-4000-8000-000000000001'
  AND a.requirement_id = '53000000-0000-4000-8000-000000000001';

INSERT INTO procedures (
  id, workpaper_id, name, description, procedure_type, sequence, expected_result
) VALUES (
  '58000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000001',
  'Inspect access reviews',
  'Inspect selected access reviews for evidence of timely independent approval.',
  'INSPECTION', 1, 'Each sampled review is completed and approved.'
);

INSERT INTO procedure_execution_requirements (
  procedure_id, organization_id, engagement_id, requirement_id,
  test_objective, expected_evidence, test_method, created_by
) VALUES (
  '58000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000001',
  'Confirm periodic access review performance and approval.',
  'Completed access review records with reviewer evidence.',
  'Inspect each approved sample item and verify completion and approval.',
  '21000000-0000-4000-8000-000000000002'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM procedure_execution_requirements per
    JOIN procedures p ON p.id = per.procedure_id
    JOIN workpapers w ON w.id = p.workpaper_id
    JOIN workpaper_requirement_links wrl
      ON wrl.workpaper_id = w.id AND wrl.requirement_id = per.requirement_id
    WHERE per.procedure_id = '58000000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'procedure execution lineage was not preserved';
  END IF;
END $$;

ROLLBACK;
