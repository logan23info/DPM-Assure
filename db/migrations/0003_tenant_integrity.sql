-- DPM-Assure cross-tenant referential integrity hardening.
-- RLS limits visibility; these constraints additionally prevent a tenant-owned child row
-- from referencing a parent row owned by another tenant even when a UUID is known.

-- SECURITY DEFINER RLS predicates query these root tables. They must remain RLS-enabled for
-- application roles, but not FORCE RLS, so the migration/schema owner can execute the narrowly
-- scoped SECURITY DEFINER lookup without recursive policy evaluation. The runtime application
-- database role MUST NOT own these tables and MUST NOT have BYPASSRLS.
ALTER TABLE memberships NO FORCE ROW LEVEL SECURITY;
ALTER TABLE engagements NO FORCE ROW LEVEL SECURITY;
ALTER TABLE workpapers NO FORCE ROW LEVEL SECURITY;
ALTER TABLE findings NO FORCE ROW LEVEL SECURITY;

-- Composite candidate keys used to bind tenant ownership into foreign keys.
ALTER TABLE clients ADD CONSTRAINT clients_org_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE engagements ADD CONSTRAINT engagements_org_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE workpapers ADD CONSTRAINT workpapers_org_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE workpapers ADD CONSTRAINT workpapers_engagement_id_id_uq UNIQUE (engagement_id, id);
ALTER TABLE procedures ADD CONSTRAINT procedures_workpaper_id_id_uq UNIQUE (workpaper_id, id);
ALTER TABLE evidence ADD CONSTRAINT evidence_org_id_id_uq UNIQUE (organization_id, id);
ALTER TABLE test_results ADD CONSTRAINT test_results_workpaper_id_id_uq UNIQUE (workpaper_id, id);
ALTER TABLE exceptions ADD CONSTRAINT exceptions_org_engagement_id_uq UNIQUE (organization_id, engagement_id, id);
ALTER TABLE findings ADD CONSTRAINT findings_org_engagement_id_uq UNIQUE (organization_id, engagement_id, id);

-- Engagement must belong to the same organization as its client.
ALTER TABLE engagements
  ADD CONSTRAINT engagements_client_same_tenant_fk
  FOREIGN KEY (organization_id, client_id)
  REFERENCES clients (organization_id, id);

-- Workpaper must belong to the same organization as its engagement.
ALTER TABLE workpapers
  ADD CONSTRAINT workpapers_engagement_same_tenant_fk
  FOREIGN KEY (organization_id, engagement_id)
  REFERENCES engagements (organization_id, id);

-- Evidence cannot mix engagement/workpaper/procedure lineage.
ALTER TABLE evidence
  ADD CONSTRAINT evidence_engagement_same_tenant_fk
  FOREIGN KEY (organization_id, engagement_id)
  REFERENCES engagements (organization_id, id);
ALTER TABLE evidence
  ADD CONSTRAINT evidence_workpaper_same_tenant_fk
  FOREIGN KEY (organization_id, workpaper_id)
  REFERENCES workpapers (organization_id, id);
ALTER TABLE evidence
  ADD CONSTRAINT evidence_procedure_same_workpaper_fk
  FOREIGN KEY (workpaper_id, procedure_id)
  REFERENCES procedures (workpaper_id, id);

-- A test result's procedure must belong to the same workpaper.
ALTER TABLE test_results
  ADD CONSTRAINT test_results_procedure_same_workpaper_fk
  FOREIGN KEY (workpaper_id, procedure_id)
  REFERENCES procedures (workpaper_id, id);

-- Sampling/PBC/review workpapers, when supplied, must belong to the referenced engagement.
ALTER TABLE samples
  ADD CONSTRAINT samples_workpaper_same_engagement_fk
  FOREIGN KEY (engagement_id, workpaper_id)
  REFERENCES workpapers (engagement_id, id);
ALTER TABLE pbc_requests
  ADD CONSTRAINT pbc_workpaper_same_engagement_fk
  FOREIGN KEY (engagement_id, workpaper_id)
  REFERENCES workpapers (engagement_id, id);
ALTER TABLE reviews
  ADD CONSTRAINT reviews_workpaper_same_engagement_fk
  FOREIGN KEY (engagement_id, workpaper_id)
  REFERENCES workpapers (engagement_id, id);

-- Exceptions must preserve workpaper/test lineage and tenant/engagement ownership.
ALTER TABLE exceptions
  ADD CONSTRAINT exceptions_engagement_same_tenant_fk
  FOREIGN KEY (organization_id, engagement_id)
  REFERENCES engagements (organization_id, id);
ALTER TABLE exceptions
  ADD CONSTRAINT exceptions_workpaper_same_tenant_fk
  FOREIGN KEY (organization_id, workpaper_id)
  REFERENCES workpapers (organization_id, id);
ALTER TABLE exceptions
  ADD CONSTRAINT exceptions_test_same_workpaper_fk
  FOREIGN KEY (workpaper_id, test_result_id)
  REFERENCES test_results (workpaper_id, id);

-- Findings/risks must remain inside one organization and engagement.
ALTER TABLE findings
  ADD CONSTRAINT findings_engagement_same_tenant_fk
  FOREIGN KEY (organization_id, engagement_id)
  REFERENCES engagements (organization_id, id);
ALTER TABLE findings
  ADD CONSTRAINT findings_exception_same_context_fk
  FOREIGN KEY (organization_id, engagement_id, exception_id)
  REFERENCES exceptions (organization_id, engagement_id, id);
ALTER TABLE risks
  ADD CONSTRAINT risks_engagement_same_tenant_fk
  FOREIGN KEY (organization_id, engagement_id)
  REFERENCES engagements (organization_id, id);
ALTER TABLE risks
  ADD CONSTRAINT risks_finding_same_context_fk
  FOREIGN KEY (organization_id, engagement_id, finding_id)
  REFERENCES findings (organization_id, engagement_id, id);

-- AI generations tied to an engagement cannot cross tenant boundaries.
ALTER TABLE ai_generations
  ADD CONSTRAINT ai_generations_engagement_same_tenant_fk
  FOREIGN KEY (organization_id, engagement_id)
  REFERENCES engagements (organization_id, id);

-- Replace the evidence-gate policy with an explicitly qualified outer reference.
DROP POLICY evidence_gate_results_tenant ON evidence_gate_results;
CREATE POLICY evidence_gate_results_tenant ON evidence_gate_results
  USING (EXISTS (
    SELECT 1 FROM evidence e
    WHERE e.id = evidence_gate_results.evidence_id
      AND e.organization_id = app_current_organization_id()
  ) AND app_is_current_org_member())
  WITH CHECK (EXISTS (
    SELECT 1 FROM evidence e
    WHERE e.id = evidence_gate_results.evidence_id
      AND e.organization_id = app_current_organization_id()
  ) AND app_is_current_org_member());

COMMENT ON CONSTRAINT engagements_client_same_tenant_fk ON engagements IS 'Prevents engagement/client cross-tenant references.';
COMMENT ON CONSTRAINT workpapers_engagement_same_tenant_fk ON workpapers IS 'Prevents workpaper/engagement cross-tenant references.';
COMMENT ON CONSTRAINT evidence_workpaper_same_tenant_fk ON evidence IS 'Preserves evidence tenant ownership through the workpaper lineage.';
