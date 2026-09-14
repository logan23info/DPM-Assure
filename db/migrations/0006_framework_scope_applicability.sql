-- DPM-Assure engagement framework, scope, and applicability governance.
-- Framework versions are frozen by reference at engagement level; applicability is explicit per requirement.

CREATE TYPE applicability_decision AS ENUM ('APPLICABLE', 'NOT_APPLICABLE', 'PENDING');

ALTER TABLE engagement_frameworks
  ADD COLUMN organization_id uuid,
  ADD COLUMN selected_by uuid REFERENCES users(id),
  ADD COLUMN selected_at timestamptz NOT NULL DEFAULT now();
UPDATE engagement_frameworks ef SET organization_id = e.organization_id FROM engagements e WHERE e.id = ef.engagement_id;
ALTER TABLE engagement_frameworks ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE engagement_frameworks ADD CONSTRAINT engagement_frameworks_engagement_tenant_fk FOREIGN KEY (engagement_id, organization_id) REFERENCES engagements(id, organization_id);

ALTER TABLE scopes
  ADD COLUMN organization_id uuid,
  ADD COLUMN scope_type text NOT NULL DEFAULT 'OTHER',
  ADD COLUMN rationale text;
UPDATE scopes s SET organization_id = e.organization_id FROM engagements e WHERE e.id = s.engagement_id;
ALTER TABLE scopes ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE scopes ADD CONSTRAINT scopes_engagement_tenant_fk FOREIGN KEY (engagement_id, organization_id) REFERENCES engagements(id, organization_id);

CREATE UNIQUE INDEX scopes_id_organization_id_uq ON scopes(id, organization_id);
CREATE INDEX engagement_frameworks_org_engagement_idx ON engagement_frameworks(organization_id, engagement_id);
CREATE INDEX scopes_org_engagement_idx ON scopes(organization_id, engagement_id);

CREATE TABLE engagement_requirement_applicability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  engagement_id uuid NOT NULL,
  framework_version_id uuid NOT NULL REFERENCES framework_versions(id),
  requirement_id uuid NOT NULL REFERENCES requirements(id),
  decision applicability_decision NOT NULL DEFAULT 'PENDING',
  rationale text,
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engagement_requirement_applicability_engagement_tenant_fk FOREIGN KEY (engagement_id, organization_id) REFERENCES engagements(id, organization_id),
  CONSTRAINT engagement_requirement_applicability_requirement_uq UNIQUE (engagement_id, requirement_id),
  CONSTRAINT engagement_requirement_applicability_decision_metadata_ck CHECK (
    (decision = 'PENDING' AND decided_by IS NULL AND decided_at IS NULL)
    OR (decision <> 'PENDING' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND rationale IS NOT NULL AND length(btrim(rationale)) > 0)
  )
);
CREATE INDEX engagement_requirement_applicability_org_engagement_idx ON engagement_requirement_applicability(organization_id, engagement_id, decision);

CREATE OR REPLACE FUNCTION enforce_engagement_requirement_version() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual_version uuid;
BEGIN
  SELECT framework_version_id INTO actual_version FROM requirements WHERE id = NEW.requirement_id;
  IF actual_version IS NULL OR actual_version <> NEW.framework_version_id THEN
    RAISE EXCEPTION 'Requirement % does not belong to framework version %', NEW.requirement_id, NEW.framework_version_id;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM engagement_frameworks ef
    WHERE ef.engagement_id = NEW.engagement_id AND ef.framework_version_id = NEW.framework_version_id AND ef.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'Framework version % is not selected for engagement %', NEW.framework_version_id, NEW.engagement_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_engagement_requirement_version BEFORE INSERT OR UPDATE ON engagement_requirement_applicability FOR EACH ROW EXECUTE FUNCTION enforce_engagement_requirement_version();

CREATE OR REPLACE FUNCTION seed_engagement_requirement_applicability() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO engagement_requirement_applicability (organization_id, engagement_id, framework_version_id, requirement_id)
  SELECT NEW.organization_id, NEW.engagement_id, NEW.framework_version_id, r.id FROM requirements r WHERE r.framework_version_id = NEW.framework_version_id
  ON CONFLICT (engagement_id, requirement_id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_seed_engagement_requirement_applicability AFTER INSERT ON engagement_frameworks FOR EACH ROW EXECUTE FUNCTION seed_engagement_requirement_applicability();

CREATE OR REPLACE FUNCTION protect_engagement_framework_selection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM engagement_requirement_applicability a
    WHERE a.engagement_id = OLD.engagement_id AND a.framework_version_id = OLD.framework_version_id AND a.decision <> 'PENDING'
  ) THEN
    RAISE EXCEPTION 'Framework selection cannot be removed after applicability decisions exist';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER trg_protect_engagement_framework_selection BEFORE DELETE ON engagement_frameworks FOR EACH ROW EXECUTE FUNCTION protect_engagement_framework_selection();

ALTER TABLE engagement_requirement_applicability ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_requirement_applicability FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_engagement_requirement_applicability ON engagement_requirement_applicability
  USING (app_engagement_in_current_org(engagement_id))
  WITH CHECK (app_engagement_in_current_org(engagement_id));

CREATE OR REPLACE FUNCTION engagement_scope_ready(candidate_engagement_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT
    EXISTS (SELECT 1 FROM engagement_frameworks ef WHERE ef.engagement_id = candidate_engagement_id)
    AND EXISTS (SELECT 1 FROM scopes s WHERE s.engagement_id = candidate_engagement_id AND s.in_scope = true)
    AND NOT EXISTS (
      SELECT 1 FROM engagement_requirement_applicability a
      WHERE a.engagement_id = candidate_engagement_id AND a.decision = 'PENDING'
    );
$$;

-- Replace the existing lifecycle function in place, preserving its accepted transitions.
CREATE OR REPLACE FUNCTION enforce_engagement_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  IF OLD.status = 'PLANNING' AND NEW.status = 'TESTING' THEN
    IF NOT engagement_governance_ready(OLD.id) THEN
      RAISE EXCEPTION 'Engagement % cannot enter TESTING until independence, risk assessment, and approved audit plan gates pass', OLD.id;
    END IF;
    IF NOT engagement_scope_ready(OLD.id) THEN
      RAISE EXCEPTION 'Engagement % cannot enter TESTING until framework, scope, and applicability gates pass', OLD.id;
    END IF;
    RETURN NEW;
  END IF;

  IF (OLD.status = 'PLANNING' AND NEW.status = 'CLOSED')
     OR (OLD.status = 'TESTING' AND NEW.status IN ('REVIEW','CLOSED'))
     OR (OLD.status = 'REVIEW' AND NEW.status = 'CLOSED') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid engagement status transition: % -> %', OLD.status, NEW.status;
END;
$$;

COMMENT ON TABLE engagement_requirement_applicability IS 'Engagement-specific applicability decisions for requirements belonging to explicitly selected framework versions.';
COMMENT ON FUNCTION engagement_scope_ready(uuid) IS 'True only when a framework version is selected, at least one boundary is in scope, and no requirement applicability decision remains pending.';
