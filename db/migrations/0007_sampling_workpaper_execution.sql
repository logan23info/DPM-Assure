-- DPM-Assure sampling, workpaper, and procedure execution hardening.
-- Builds traceability from approved applicability decisions through scope/sample/workpaper/procedure.

CREATE TYPE sample_review_status AS ENUM ('DRAFT','APPROVED','REJECTED');

ALTER TABLE samples
  ADD COLUMN organization_id uuid,
  ADD COLUMN requirement_id uuid REFERENCES requirements(id),
  ADD COLUMN scope_id uuid REFERENCES scopes(id),
  ADD COLUMN review_status sample_review_status NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN reviewed_by uuid REFERENCES users(id),
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN review_rationale text;

UPDATE samples s
SET organization_id = e.organization_id
FROM engagements e
WHERE e.id = s.engagement_id;

ALTER TABLE samples ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE samples
  ADD CONSTRAINT samples_engagement_tenant_fk
  FOREIGN KEY (engagement_id, organization_id)
  REFERENCES engagements(id, organization_id);

ALTER TABLE samples
  ADD CONSTRAINT samples_review_shape_ck
  CHECK (
    (review_status = 'DRAFT' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR
    (review_status IN ('APPROVED','REJECTED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND review_rationale IS NOT NULL AND length(btrim(review_rationale)) > 0)
  );

CREATE INDEX samples_org_engagement_idx ON samples(organization_id, engagement_id);

CREATE TABLE sample_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  engagement_id uuid NOT NULL,
  sample_id uuid NOT NULL REFERENCES samples(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  item_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  selection_reason text NOT NULL,
  selected_by uuid NOT NULL REFERENCES users(id),
  selected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(sample_id, item_key),
  CONSTRAINT sample_items_engagement_tenant_fk
    FOREIGN KEY (engagement_id, organization_id)
    REFERENCES engagements(id, organization_id)
);

CREATE INDEX sample_items_sample_idx ON sample_items(sample_id);

CREATE TABLE workpaper_requirement_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  engagement_id uuid NOT NULL,
  workpaper_id uuid NOT NULL REFERENCES workpapers(id) ON DELETE CASCADE,
  applicability_id uuid NOT NULL REFERENCES engagement_requirement_applicability(id),
  requirement_id uuid NOT NULL REFERENCES requirements(id),
  control_id uuid REFERENCES controls(id),
  linked_by uuid NOT NULL REFERENCES users(id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workpaper_id, requirement_id),
  CONSTRAINT workpaper_requirement_links_engagement_tenant_fk
    FOREIGN KEY (engagement_id, organization_id)
    REFERENCES engagements(id, organization_id)
);

CREATE INDEX workpaper_requirement_links_workpaper_idx ON workpaper_requirement_links(workpaper_id);
CREATE INDEX workpaper_requirement_links_requirement_idx ON workpaper_requirement_links(requirement_id);

CREATE TABLE workpaper_sample_links (
  workpaper_id uuid NOT NULL REFERENCES workpapers(id) ON DELETE CASCADE,
  sample_id uuid NOT NULL REFERENCES samples(id),
  linked_by uuid NOT NULL REFERENCES users(id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workpaper_id, sample_id)
);

CREATE TABLE procedure_execution_requirements (
  procedure_id uuid PRIMARY KEY REFERENCES procedures(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  engagement_id uuid NOT NULL,
  requirement_id uuid NOT NULL REFERENCES requirements(id),
  test_objective text NOT NULL,
  expected_evidence text NOT NULL,
  test_method text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT procedure_execution_requirements_engagement_tenant_fk
    FOREIGN KEY (engagement_id, organization_id)
    REFERENCES engagements(id, organization_id)
);

CREATE OR REPLACE FUNCTION enforce_sample_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  scope_engagement uuid;
  decision applicability_decision;
BEGIN
  IF NEW.scope_id IS NOT NULL THEN
    SELECT engagement_id INTO scope_engagement FROM scopes WHERE id = NEW.scope_id;
    IF scope_engagement IS DISTINCT FROM NEW.engagement_id THEN
      RAISE EXCEPTION 'Sample scope must belong to the same engagement';
    END IF;
  END IF;

  IF NEW.requirement_id IS NOT NULL THEN
    SELECT a.decision INTO decision
    FROM engagement_requirement_applicability a
    WHERE a.engagement_id = NEW.engagement_id
      AND a.requirement_id = NEW.requirement_id;

    IF decision IS DISTINCT FROM 'APPLICABLE'::applicability_decision THEN
      RAISE EXCEPTION 'Sample requirement must be explicitly APPLICABLE for the engagement';
    END IF;
  END IF;

  IF NEW.sample_size IS NOT NULL AND NEW.population_size IS NOT NULL AND NEW.sample_size > NEW.population_size THEN
    RAISE EXCEPTION 'Sample size cannot exceed population size';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_sample_lineage
BEFORE INSERT OR UPDATE ON samples
FOR EACH ROW EXECUTE FUNCTION enforce_sample_lineage();

CREATE OR REPLACE FUNCTION protect_approved_sample()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.review_status = 'APPROVED' THEN
    RAISE EXCEPTION 'Approved sample % is immutable; create a superseding sample instead', OLD.id;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER trg_protect_approved_sample
BEFORE UPDATE OR DELETE ON samples
FOR EACH ROW EXECUTE FUNCTION protect_approved_sample();

CREATE OR REPLACE FUNCTION protect_approved_sample_items()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  candidate_sample_id uuid;
BEGIN
  candidate_sample_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.sample_id ELSE NEW.sample_id END;
  IF EXISTS (SELECT 1 FROM samples s WHERE s.id = candidate_sample_id AND s.review_status = 'APPROVED') THEN
    RAISE EXCEPTION 'Items of an approved sample are immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER trg_protect_approved_sample_items
BEFORE INSERT OR UPDATE OR DELETE ON sample_items
FOR EACH ROW EXECUTE FUNCTION protect_approved_sample_items();

CREATE OR REPLACE FUNCTION enforce_workpaper_requirement_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  wp_engagement uuid;
  wp_org uuid;
  app_requirement uuid;
  app_decision applicability_decision;
BEGIN
  SELECT engagement_id, organization_id INTO wp_engagement, wp_org
  FROM workpapers WHERE id = NEW.workpaper_id;

  IF wp_engagement IS DISTINCT FROM NEW.engagement_id OR wp_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Workpaper lineage must remain in the same tenant and engagement';
  END IF;

  SELECT requirement_id, decision INTO app_requirement, app_decision
  FROM engagement_requirement_applicability
  WHERE id = NEW.applicability_id
    AND engagement_id = NEW.engagement_id;

  IF app_requirement IS DISTINCT FROM NEW.requirement_id OR app_decision IS DISTINCT FROM 'APPLICABLE'::applicability_decision THEN
    RAISE EXCEPTION 'Workpaper may link only to an APPLICABLE engagement requirement';
  END IF;

  IF NEW.control_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM control_requirement_mappings m
    WHERE m.control_id = NEW.control_id
      AND m.requirement_id = NEW.requirement_id
      AND (m.retired_at IS NULL OR m.retired_at > now())
  ) THEN
    RAISE EXCEPTION 'Control is not mapped to the linked requirement';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_workpaper_requirement_lineage
BEFORE INSERT OR UPDATE ON workpaper_requirement_links
FOR EACH ROW EXECUTE FUNCTION enforce_workpaper_requirement_lineage();

CREATE OR REPLACE FUNCTION enforce_workpaper_sample_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  wp_engagement uuid;
  sample_engagement uuid;
  sample_status sample_review_status;
BEGIN
  SELECT engagement_id INTO wp_engagement FROM workpapers WHERE id = NEW.workpaper_id;
  SELECT engagement_id, review_status INTO sample_engagement, sample_status FROM samples WHERE id = NEW.sample_id;

  IF wp_engagement IS DISTINCT FROM sample_engagement THEN
    RAISE EXCEPTION 'Workpaper and sample must belong to the same engagement';
  END IF;
  IF sample_status IS DISTINCT FROM 'APPROVED'::sample_review_status THEN
    RAISE EXCEPTION 'Only APPROVED samples may be linked to workpapers';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_workpaper_sample_lineage
BEFORE INSERT OR UPDATE ON workpaper_sample_links
FOR EACH ROW EXECUTE FUNCTION enforce_workpaper_sample_lineage();

CREATE OR REPLACE FUNCTION enforce_procedure_execution_lineage()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  procedure_workpaper uuid;
  wp_engagement uuid;
  wp_org uuid;
BEGIN
  SELECT workpaper_id INTO procedure_workpaper FROM procedures WHERE id = NEW.procedure_id;
  SELECT engagement_id, organization_id INTO wp_engagement, wp_org FROM workpapers WHERE id = procedure_workpaper;

  IF wp_engagement IS DISTINCT FROM NEW.engagement_id OR wp_org IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'Procedure execution requirement must match its workpaper tenant and engagement';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM workpaper_requirement_links wrl
    WHERE wrl.workpaper_id = procedure_workpaper
      AND wrl.requirement_id = NEW.requirement_id
  ) THEN
    RAISE EXCEPTION 'Procedure requirement must already be linked to its workpaper';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_procedure_execution_lineage
BEFORE INSERT OR UPDATE ON procedure_execution_requirements
FOR EACH ROW EXECUTE FUNCTION enforce_procedure_execution_lineage();

ALTER TABLE sample_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sample_items FORCE ROW LEVEL SECURITY;
CREATE POLICY sample_items_tenant ON sample_items
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE workpaper_requirement_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE workpaper_requirement_links FORCE ROW LEVEL SECURITY;
CREATE POLICY workpaper_requirement_links_tenant ON workpaper_requirement_links
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

ALTER TABLE workpaper_sample_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE workpaper_sample_links FORCE ROW LEVEL SECURITY;
CREATE POLICY workpaper_sample_links_tenant ON workpaper_sample_links
  USING (app_workpaper_in_current_org(workpaper_id))
  WITH CHECK (app_workpaper_in_current_org(workpaper_id));

ALTER TABLE procedure_execution_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE procedure_execution_requirements FORCE ROW LEVEL SECURITY;
CREATE POLICY procedure_execution_requirements_tenant ON procedure_execution_requirements
  USING (organization_id = app_current_organization_id() AND app_is_current_org_member())
  WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member());

COMMENT ON TABLE sample_items IS 'Immutable selected population items once their parent sample is approved.';
COMMENT ON TABLE workpaper_requirement_links IS 'Traceability from a workpaper to an explicitly applicable requirement and optional mapped control.';
COMMENT ON TABLE procedure_execution_requirements IS 'Execution contract for a procedure: linked requirement, objective, expected evidence, and test method.';
