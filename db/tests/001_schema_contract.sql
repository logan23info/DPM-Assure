-- DPM-Assure schema contract assertions.
-- Run after all migrations against a disposable PostgreSQL database.
-- Any failed assertion raises an exception and must fail CI/release validation.

DO $$
DECLARE
  missing text;
BEGIN
  -- Canonical tables required by the assurance lifecycle.
  SELECT string_agg(t, ', ')
    INTO missing
  FROM unnest(ARRAY[
    'organizations','users','memberships','clients','sources','frameworks','framework_versions','requirements','controls','control_requirement_mappings',
    'engagements','engagement_frameworks','scopes','independence_checks','risk_assessments','audit_plans','samples','workpapers','workpaper_versions','procedures',
    'pbc_requests','evidence','evidence_gate_results','test_results','exceptions','findings','risks','remediations','risk_acceptances','retests','reviews','signoffs',
    'reports','audit_freezes','audit_logs','domain_events','notifications','ai_generations','data_lineage'
  ]) AS t
  WHERE to_regclass('public.' || t) IS NULL;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing canonical tables: %', missing;
  END IF;
END $$;

DO $$
DECLARE
  missing text;
BEGIN
  -- Tenant/assurance tables that must have RLS enabled.
  SELECT string_agg(t, ', ')
    INTO missing
  FROM unnest(ARRAY[
    'organizations','users','memberships','clients','controls','engagements','engagement_frameworks','scopes','independence_checks','risk_assessments','audit_plans',
    'samples','workpapers','workpaper_versions','procedures','pbc_requests','evidence','evidence_gate_results','test_results','exceptions','findings','risks',
    'remediations','risk_acceptances','retests','reviews','signoffs','reports','audit_freezes','audit_logs','domain_events','notifications','ai_generations','data_lineage'
  ]) AS t
  LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || t)
  WHERE c.oid IS NULL OR c.relrowsecurity IS NOT TRUE;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'RLS not enabled on required tables: %', missing;
  END IF;
END $$;

DO $$
DECLARE
  actual text[];
  expected text[] := ARRAY['PLANNING','TESTING','REVIEW','CLOSED'];
BEGIN
  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
    INTO actual
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE t.typname = 'engagement_status';

  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'engagement_status drift. expected %, actual %', expected, actual;
  END IF;
END $$;

DO $$
DECLARE
  actual text[];
  expected text[] := ARRAY['GENERATED','AI_REVIEW_PENDING','HUMAN_REVIEW','APPROVED','REJECTED','PUBLISHED'];
BEGIN
  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
    INTO actual
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE t.typname = 'ai_review_status';

  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'ai_review_status drift. expected %, actual %', expected, actual;
  END IF;
END $$;

DO $$
DECLARE
  missing text;
BEGIN
  -- Named constraints prove cross-tenant lineage is structurally bound.
  SELECT string_agg(name, ', ')
    INTO missing
  FROM unnest(ARRAY[
    'engagements_client_same_tenant_fk',
    'workpapers_engagement_same_tenant_fk',
    'evidence_engagement_same_tenant_fk',
    'evidence_workpaper_same_tenant_fk',
    'evidence_procedure_same_workpaper_fk',
    'test_results_procedure_same_workpaper_fk',
    'exceptions_engagement_same_tenant_fk',
    'exceptions_workpaper_same_tenant_fk',
    'exceptions_test_same_workpaper_fk',
    'findings_engagement_same_tenant_fk',
    'findings_exception_same_context_fk',
    'risks_engagement_same_tenant_fk',
    'risks_finding_same_context_fk',
    'ai_generations_engagement_same_tenant_fk'
  ]) AS name
  WHERE NOT EXISTS (SELECT 1 FROM pg_constraint pc WHERE pc.conname = name);

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing tenant-integrity constraints: %', missing;
  END IF;
END $$;

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(name, ', ')
    INTO missing
  FROM unnest(ARRAY[
    'engagements_status_transition',
    'audit_logs_append_only',
    'domain_events_append_only',
    'workpaper_versions_append_only',
    'audit_freezes_append_only',
    'engagements_freeze_guard',
    'workpapers_freeze_guard'
  ]) AS name
  WHERE NOT EXISTS (SELECT 1 FROM pg_trigger pt WHERE pt.tgname = name AND NOT pt.tgisinternal);

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Missing lifecycle/history triggers: %', missing;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('app_current_user_id()') IS NULL
     OR to_regprocedure('app_current_organization_id()') IS NULL
     OR to_regprocedure('app_is_current_org_member()') IS NULL
     OR to_regprocedure('app_engagement_in_current_org(uuid)') IS NULL
     OR to_regprocedure('app_workpaper_in_current_org(uuid)') IS NULL
     OR to_regprocedure('app_finding_in_current_org(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing tenant-context/RLS helper function';
  END IF;
END $$;

-- Canonical naming checks that specifically prevent regressions seen in the legacy system.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='engagements' AND column_name='name') THEN
    RAISE EXCEPTION 'Canonical engagements.name column missing';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='engagements' AND column_name='title') THEN
    RAISE EXCEPTION 'Non-canonical engagements.title must not exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workpaper_versions' AND column_name='changed_by')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='workpaper_versions' AND column_name='changed_at') THEN
    RAISE EXCEPTION 'Canonical workpaper version actor/timestamp columns missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='signoffs' AND column_name='reviewed_by') THEN
    RAISE EXCEPTION 'Canonical signoffs.reviewed_by column missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_logs' AND column_name='actor_user_id') THEN
    RAISE EXCEPTION 'Canonical audit_logs.actor_user_id column missing';
  END IF;
END $$;

SELECT 'DPM-Assure schema contract: PASS' AS result;
