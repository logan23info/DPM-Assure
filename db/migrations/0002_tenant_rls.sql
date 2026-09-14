-- DPM-Assure tenant isolation / RLS hardening
-- Requires the application to set, per transaction after authentication:
--   SET LOCAL app.user_id = '<authenticated-user-uuid>';
--   SET LOCAL app.organization_id = '<selected-membership-organization-uuid>';
-- The settings are inputs to RLS, not a replacement for authentication. Database credentials
-- must remain server-side and untrusted clients must never be able to open DB sessions directly.

CREATE OR REPLACE FUNCTION app_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.organization_id', true), '')::uuid
$$;

-- SECURITY DEFINER avoids recursive membership RLS checks. The function is deliberately narrow,
-- pins search_path, and disables row security only for this membership lookup.
CREATE OR REPLACE FUNCTION app_is_current_org_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM memberships m
    WHERE m.organization_id = app_current_organization_id()
      AND m.user_id = app_current_user_id()
      AND m.status = 'ACTIVE'
  )
$$;

CREATE OR REPLACE FUNCTION app_user_in_current_org(candidate_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT candidate_user_id = app_current_user_id()
      OR EXISTS (
        SELECT 1
        FROM memberships m
        WHERE m.organization_id = app_current_organization_id()
          AND m.user_id = candidate_user_id
          AND m.status = 'ACTIVE'
      )
$$;

REVOKE ALL ON FUNCTION app_is_current_org_member() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_user_in_current_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_is_current_org_member() TO PUBLIC;
GRANT EXECUTE ON FUNCTION app_user_in_current_org(uuid) TO PUBLIC;

-- Identity / tenancy roots.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organizations_current_org ON organizations
  USING (id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY memberships_current_org ON memberships
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
CREATE POLICY clients_current_org ON clients
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY users_same_org_select ON users FOR SELECT
  USING (app_is_current_org_member() AND app_user_in_current_org(id));
CREATE POLICY users_self_update ON users FOR UPDATE
  USING (id = app_current_user_id() AND app_is_current_org_member())
  WITH CHECK (id = app_current_user_id() AND app_is_current_org_member());

-- Directly tenant-owned tables.
ALTER TABLE engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagements FORCE ROW LEVEL SECURITY;
CREATE POLICY engagements_current_org ON engagements
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE workpapers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workpapers FORCE ROW LEVEL SECURITY;
CREATE POLICY workpapers_current_org ON workpapers
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_current_org ON evidence
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exceptions FORCE ROW LEVEL SECURITY;
CREATE POLICY exceptions_current_org ON exceptions
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE findings FORCE ROW LEVEL SECURITY;
CREATE POLICY findings_current_org ON findings
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE risks FORCE ROW LEVEL SECURITY;
CREATE POLICY risks_current_org ON risks
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_current_org_select ON audit_logs FOR SELECT
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member());
CREATE POLICY audit_logs_current_org_insert ON audit_logs FOR INSERT
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE domain_events FORCE ROW LEVEL SECURITY;
CREATE POLICY domain_events_current_org_select ON domain_events FOR SELECT
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member());
CREATE POLICY domain_events_current_org_insert ON domain_events FOR INSERT
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_current_org ON notifications
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generations FORCE ROW LEVEL SECURITY;
CREATE POLICY ai_generations_current_org ON ai_generations
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE data_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_lineage FORCE ROW LEVEL SECURITY;
CREATE POLICY data_lineage_current_org ON data_lineage
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

-- Controls may be global (organization_id IS NULL) or tenant-owned. Global controls are readable
-- by authenticated members, but inserts/updates through tenant sessions must remain tenant-owned.
ALTER TABLE controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE controls FORCE ROW LEVEL SECURITY;
CREATE POLICY controls_select ON controls FOR SELECT
  USING (app_is_current_org_member() AND (organization_id IS NULL OR organization_id = app_current_organization_id()));
CREATE POLICY controls_insert ON controls FOR INSERT
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());
CREATE POLICY controls_update ON controls FOR UPDATE
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());
CREATE POLICY controls_delete ON controls FOR DELETE
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member());

-- Helper predicates for engagement/workpaper/finding-derived ownership.
CREATE OR REPLACE FUNCTION app_engagement_in_current_org(candidate_engagement_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM engagements e
    WHERE e.id = candidate_engagement_id
      AND e.organization_id = app_current_organization_id()
  ) AND app_is_current_org_member()
$$;

CREATE OR REPLACE FUNCTION app_workpaper_in_current_org(candidate_workpaper_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workpapers w
    WHERE w.id = candidate_workpaper_id
      AND w.organization_id = app_current_organization_id()
  ) AND app_is_current_org_member()
$$;

CREATE OR REPLACE FUNCTION app_finding_in_current_org(candidate_finding_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM findings f
    WHERE f.id = candidate_finding_id
      AND f.organization_id = app_current_organization_id()
  ) AND app_is_current_org_member()
$$;

REVOKE ALL ON FUNCTION app_engagement_in_current_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_workpaper_in_current_org(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_finding_in_current_org(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_engagement_in_current_org(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION app_workpaper_in_current_org(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION app_finding_in_current_org(uuid) TO PUBLIC;

-- Engagement-derived tables.
ALTER TABLE engagement_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_frameworks FORCE ROW LEVEL SECURITY;
CREATE POLICY engagement_frameworks_tenant ON engagement_frameworks
  USING (app_engagement_in_current_org(engagement_id))
  WITH CHECK (app_engagement_in_current_org(engagement_id));

ALTER TABLE scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE scopes FORCE ROW LEVEL SECURITY;
CREATE POLICY scopes_tenant ON scopes
  USING (app_engagement_in_current_org(engagement_id))
  WITH CHECK (app_engagement_in_current_org(engagement_id));

ALTER TABLE independence_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE independence_checks FORCE ROW LEVEL SECURITY;
CREATE POLICY independence_checks_tenant ON independence_checks
  USING (app_engagement_in_current_org(engagement_id))
  WITH CHECK (app_engagement_in_current_org(engagement_id));

ALTER TABLE risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_assessments FORCE ROW LEVEL SECURITY;
CREATE POLICY risk_assessments_tenant ON risk_assessments
  USING (app_engagement_in_current_org(engagement_id))
  WITH CHECK (app_engagement_in_current_org(engagement_id));

ALTER TABLE audit_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_plans_tenant ON audit_plans
  USING (app_engagement_in_current_org(engagement_id))
  WITH CHECK (app_engagement_in_current_org(engagement_id));

ALTER TABLE samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE samples FORCE ROW LEVEL SECURITY;
CREATE POLICY samples_tenant ON samples
  USING (app_engagement_in_current_org(engagement_id))
  WITH CHECK (app_engagement_in_current_org(engagement_id));

ALTER TABLE pbc_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pbc_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY pbc_requests_tenant ON pbc_requests
  USING (app_engagement_in_current_org(engagement_id))
  WITH CHECK (app_engagement_in_current_org(engagement_id));

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY reviews_tenant ON reviews
  USING (app_engagement_in_current_org(engagement_id))
  WITH CHECK (app_engagement_in_current_org(engagement_id));

ALTER TABLE signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE signoffs FORCE ROW LEVEL SECURITY;
CREATE POLICY signoffs_tenant ON signoffs
  USING (app_engagement_in_current_org(engagement_id))
  WITH CHECK (app_engagement_in_current_org(engagement_id));

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports FORCE ROW LEVEL SECURITY;
CREATE POLICY reports_tenant ON reports
  USING (app_engagement_in_current_org(engagement_id))
  WITH CHECK (app_engagement_in_current_org(engagement_id));

ALTER TABLE audit_freezes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_freezes FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_freezes_tenant_select ON audit_freezes FOR SELECT
  USING (app_engagement_in_current_org(engagement_id));
CREATE POLICY audit_freezes_tenant_insert ON audit_freezes FOR INSERT
  WITH CHECK (app_engagement_in_current_org(engagement_id));

-- Workpaper-derived execution tables.
ALTER TABLE workpaper_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workpaper_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY workpaper_versions_tenant_select ON workpaper_versions FOR SELECT
  USING (app_workpaper_in_current_org(workpaper_id));
CREATE POLICY workpaper_versions_tenant_insert ON workpaper_versions FOR INSERT
  WITH CHECK (app_workpaper_in_current_org(workpaper_id));

ALTER TABLE procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedures FORCE ROW LEVEL SECURITY;
CREATE POLICY procedures_tenant ON procedures
  USING (app_workpaper_in_current_org(workpaper_id))
  WITH CHECK (app_workpaper_in_current_org(workpaper_id));

ALTER TABLE test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_results FORCE ROW LEVEL SECURITY;
CREATE POLICY test_results_tenant ON test_results
  USING (app_workpaper_in_current_org(workpaper_id))
  WITH CHECK (app_workpaper_in_current_org(workpaper_id));

ALTER TABLE evidence_gate_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_gate_results FORCE ROW LEVEL SECURITY;
CREATE POLICY evidence_gate_results_tenant ON evidence_gate_results
  USING (EXISTS (
    SELECT 1 FROM evidence e
    WHERE e.id = evidence_id
      AND e.organization_id = app_current_organization_id()
  ) AND app_is_current_org_member())
  WITH CHECK (EXISTS (
    SELECT 1 FROM evidence e
    WHERE e.id = evidence_id
      AND e.organization_id = app_current_organization_id()
  ) AND app_is_current_org_member());

-- Finding-derived outcome tables.
ALTER TABLE remediations ENABLE ROW LEVEL SECURITY;
ALTER TABLE remediations FORCE ROW LEVEL SECURITY;
CREATE POLICY remediations_tenant ON remediations
  USING (app_finding_in_current_org(finding_id))
  WITH CHECK (app_finding_in_current_org(finding_id));

ALTER TABLE risk_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_acceptances FORCE ROW LEVEL SECURITY;
CREATE POLICY risk_acceptances_tenant ON risk_acceptances
  USING (app_finding_in_current_org(finding_id))
  WITH CHECK (app_finding_in_current_org(finding_id));

ALTER TABLE retests ENABLE ROW LEVEL SECURITY;
ALTER TABLE retests FORCE ROW LEVEL SECURITY;
CREATE POLICY retests_tenant ON retests
  USING (app_finding_in_current_org(finding_id))
  WITH CHECK (app_finding_in_current_org(finding_id));

COMMENT ON FUNCTION app_current_user_id() IS 'Authenticated application user UUID from transaction-local session context.';
COMMENT ON FUNCTION app_current_organization_id() IS 'Selected authenticated membership organization UUID from transaction-local session context.';
COMMENT ON FUNCTION app_is_current_org_member() IS 'Defense-in-depth membership predicate used by tenant RLS policies.';
