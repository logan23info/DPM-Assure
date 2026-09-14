-- DPM-Assure canonical PostgreSQL foundation schema
-- Database-first implementation of docs/DATABASE-SCHEMA.md.
-- Application code MUST use these names/statuses and authenticated tenant context.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE record_status AS ENUM ('ACTIVE','INACTIVE','ARCHIVED');
CREATE TYPE membership_role AS ENUM ('SUPER_ADMIN','ORG_ADMIN','AUDIT_MANAGER','LEAD_AUDITOR','AUDITOR','REVIEWER','CLIENT','VIEWER');
CREATE TYPE engagement_status AS ENUM ('PLANNING','TESTING','REVIEW','CLOSED');
CREATE TYPE review_status AS ENUM ('PENDING','IN_REVIEW','APPROVED','REJECTED');
CREATE TYPE ai_review_status AS ENUM ('GENERATED','AI_REVIEW_PENDING','HUMAN_REVIEW','APPROVED','REJECTED','PUBLISHED');
CREATE TYPE gate_result AS ENUM ('PASS','FAIL','INSUFFICIENT_EVIDENCE');
CREATE TYPE test_result_status AS ENUM ('PASS','FAIL','INSUFFICIENT_EVIDENCE','NOT_APPLICABLE');
CREATE TYPE workflow_status AS ENUM ('OPEN','IN_PROGRESS','BLOCKED','COMPLETED','CLOSED','CANCELLED');

CREATE TABLE organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE,
 status record_status NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, display_name text NOT NULL,
 status record_status NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id),
 role membership_role NOT NULL, status record_status NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,user_id)
);
CREATE INDEX memberships_user_idx ON memberships(user_id);
CREATE TABLE clients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
 status record_status NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,name)
);

CREATE TABLE sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id text NOT NULL UNIQUE, authority text NOT NULL, type text NOT NULL, title text NOT NULL,
 edition text, status record_status NOT NULL DEFAULT 'ACTIVE', jurisdiction text, source_url text NOT NULL, published_at timestamptz, effective_at timestamptz,
 retired_at timestamptz, last_validated_at timestamptz, validated_by uuid REFERENCES users(id), next_review_at timestamptz, license_notes text, intended_use text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK(retired_at IS NULL OR effective_at IS NULL OR retired_at >= effective_at)
);
CREATE TABLE frameworks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), framework_key text NOT NULL UNIQUE, name text NOT NULL, authority text NOT NULL,
 status record_status NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE framework_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), framework_id uuid NOT NULL REFERENCES frameworks(id), version text NOT NULL, status record_status NOT NULL DEFAULT 'ACTIVE',
 published_at timestamptz, effective_at timestamptz, retired_at timestamptz, source_id uuid REFERENCES sources(id), source_url text, validated_at timestamptz,
 validated_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(framework_id,version)
);
CREATE TABLE requirements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), framework_version_id uuid NOT NULL REFERENCES framework_versions(id), requirement_key text NOT NULL,
 title text NOT NULL, description text NOT NULL, classification text NOT NULL, section_reference text, applicability text, test_procedure text, expected_evidence text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(framework_version_id,requirement_key)
);
CREATE TABLE controls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id), control_key text NOT NULL, title text NOT NULL, description text NOT NULL,
 control_type text NOT NULL, objective text, test_procedure text, expected_evidence text, status record_status NOT NULL DEFAULT 'ACTIVE',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX controls_global_key_uq ON controls(control_key) WHERE organization_id IS NULL;
CREATE UNIQUE INDEX controls_org_key_uq ON controls(organization_id,control_key) WHERE organization_id IS NOT NULL;
CREATE TABLE control_requirement_mappings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), control_id uuid NOT NULL REFERENCES controls(id), requirement_id uuid NOT NULL REFERENCES requirements(id),
 relationship text NOT NULL, coverage text NOT NULL, rationale text NOT NULL, source_reference text, reviewer_id uuid REFERENCES users(id), reviewed_at timestamptz,
 effective_at timestamptz, retired_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(control_id,requirement_id,effective_at)
);

CREATE TABLE engagements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), client_id uuid NOT NULL REFERENCES clients(id), name text NOT NULL,
 description text, status engagement_status NOT NULL DEFAULT 'PLANNING', start_date date, end_date date, lead_auditor_id uuid REFERENCES users(id), created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), frozen_at timestamptz, CHECK(end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX engagements_org_status_idx ON engagements(organization_id,status);
CREATE TABLE engagement_frameworks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), engagement_id uuid NOT NULL REFERENCES engagements(id), framework_version_id uuid NOT NULL REFERENCES framework_versions(id),
 applicability_status text NOT NULL, rationale text, reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz, UNIQUE(engagement_id,framework_version_id)
);
CREATE TABLE scopes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), engagement_id uuid NOT NULL REFERENCES engagements(id), name text NOT NULL, description text, in_scope boolean NOT NULL DEFAULT true,
 owner text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE independence_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), engagement_id uuid NOT NULL REFERENCES engagements(id), subject_user_id uuid NOT NULL REFERENCES users(id), result text NOT NULL,
 conflict_details text, resolved_by uuid REFERENCES users(id), resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE risk_assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), engagement_id uuid NOT NULL REFERENCES engagements(id), method_version text NOT NULL, inherent_score numeric(10,2), control_score numeric(10,2),
 residual_score numeric(10,2), rationale text NOT NULL, assessed_by uuid NOT NULL REFERENCES users(id), assessed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), engagement_id uuid NOT NULL REFERENCES engagements(id), version integer NOT NULL CHECK(version>0), status review_status NOT NULL DEFAULT 'PENDING',
 objectives text NOT NULL, scope_summary text NOT NULL, sampling_approach text, approved_by uuid REFERENCES users(id), approved_at timestamptz, created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(engagement_id,version)
);

CREATE TABLE workpapers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), engagement_id uuid NOT NULL REFERENCES engagements(id), control_id uuid REFERENCES controls(id),
 title text NOT NULL, status workflow_status NOT NULL DEFAULT 'OPEN', prepared_by uuid NOT NULL REFERENCES users(id), reviewer_id uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), frozen_at timestamptz
);
CREATE INDEX workpapers_org_engagement_idx ON workpapers(organization_id,engagement_id);
CREATE TABLE workpaper_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workpaper_id uuid NOT NULL REFERENCES workpapers(id), version_number integer NOT NULL CHECK(version_number>0), content jsonb NOT NULL,
 changed_by uuid NOT NULL REFERENCES users(id), changed_at timestamptz NOT NULL DEFAULT now(), change_reason text NOT NULL, UNIQUE(workpaper_id,version_number)
);
CREATE TABLE procedures (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workpaper_id uuid NOT NULL REFERENCES workpapers(id), name text NOT NULL, description text NOT NULL, procedure_type text NOT NULL,
 sequence integer NOT NULL CHECK(sequence>0), expected_result text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workpaper_id,sequence)
);
CREATE TABLE pbc_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), engagement_id uuid NOT NULL REFERENCES engagements(id), workpaper_id uuid REFERENCES workpapers(id), requested_by uuid NOT NULL REFERENCES users(id),
 assigned_to uuid REFERENCES users(id), title text NOT NULL, description text, status workflow_status NOT NULL DEFAULT 'OPEN', due_at timestamptz, fulfilled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), engagement_id uuid NOT NULL REFERENCES engagements(id), workpaper_id uuid NOT NULL REFERENCES workpapers(id),
 procedure_id uuid REFERENCES procedures(id), filename text NOT NULL, mime_type text NOT NULL, size_bytes bigint NOT NULL CHECK(size_bytes>=0), storage_key text NOT NULL, sha256 char(64) NOT NULL,
 uploaded_by uuid NOT NULL REFERENCES users(id), uploaded_at timestamptz NOT NULL DEFAULT now(), retention_until timestamptz, source_description text, chain_of_custody_ref text,
 status record_status NOT NULL DEFAULT 'ACTIVE', CHECK(sha256 ~ '^[0-9a-fA-F]{64}$'), UNIQUE(organization_id,storage_key)
);
CREATE INDEX evidence_workpaper_idx ON evidence(workpaper_id);
CREATE TABLE evidence_gate_results (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), evidence_id uuid NOT NULL REFERENCES evidence(id), gate_version text NOT NULL, identity_status gate_result NOT NULL,
 provenance_status gate_result NOT NULL, integrity_status gate_result NOT NULL, authorization_status gate_result NOT NULL, applicability_status gate_result NOT NULL,
 temporal_status gate_result NOT NULL, completeness_status gate_result NOT NULL, overall_result gate_result NOT NULL, evaluated_by uuid NOT NULL REFERENCES users(id),
 evaluated_at timestamptz NOT NULL DEFAULT now(), rationale text NOT NULL
);
CREATE TABLE test_results (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workpaper_id uuid NOT NULL REFERENCES workpapers(id), procedure_id uuid NOT NULL REFERENCES procedures(id),
 evidence_gate_result_id uuid REFERENCES evidence_gate_results(id), result test_result_status NOT NULL, exception_summary text, conclusion text,
 tested_by uuid NOT NULL REFERENCES users(id), tested_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE samples (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), engagement_id uuid NOT NULL REFERENCES engagements(id), workpaper_id uuid REFERENCES workpapers(id), population_description text NOT NULL,
 population_size bigint CHECK(population_size>=0), sampling_method text NOT NULL, sample_size bigint CHECK(sample_size>=0), selection_basis text NOT NULL,
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE exceptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), engagement_id uuid NOT NULL REFERENCES engagements(id), workpaper_id uuid NOT NULL REFERENCES workpapers(id),
 test_result_id uuid NOT NULL REFERENCES test_results(id), description text NOT NULL, severity text NOT NULL, status workflow_status NOT NULL DEFAULT 'OPEN', created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE findings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), engagement_id uuid NOT NULL REFERENCES engagements(id), exception_id uuid REFERENCES exceptions(id),
 title text NOT NULL, description text NOT NULL, finding_type text NOT NULL, status workflow_status NOT NULL DEFAULT 'OPEN', risk_id uuid, created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE risks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), engagement_id uuid NOT NULL REFERENCES engagements(id), finding_id uuid NOT NULL UNIQUE REFERENCES findings(id),
 likelihood numeric(10,2) NOT NULL, impact numeric(10,2) NOT NULL, score numeric(10,2) NOT NULL, method_version text NOT NULL, rationale text NOT NULL,
 assessed_by uuid NOT NULL REFERENCES users(id), assessed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE findings ADD CONSTRAINT findings_risk_fk FOREIGN KEY(risk_id) REFERENCES risks(id);
CREATE TABLE remediations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), finding_id uuid NOT NULL REFERENCES findings(id), owner_user_id uuid REFERENCES users(id), plan text NOT NULL,
 status workflow_status NOT NULL DEFAULT 'OPEN', target_date date, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE risk_acceptances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), finding_id uuid NOT NULL REFERENCES findings(id), accepted_by uuid NOT NULL REFERENCES users(id), rationale text NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, review_due_at timestamptz NOT NULL, status workflow_status NOT NULL DEFAULT 'OPEN',
 CHECK(expires_at > accepted_at), CHECK(review_due_at <= expires_at)
);
CREATE TABLE retests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), finding_id uuid NOT NULL REFERENCES findings(id), remediation_id uuid REFERENCES remediations(id), result test_result_status NOT NULL,
 evidence_id uuid REFERENCES evidence(id), tested_by uuid NOT NULL REFERENCES users(id), tested_at timestamptz NOT NULL DEFAULT now(), conclusion text NOT NULL
);

CREATE TABLE reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), engagement_id uuid NOT NULL REFERENCES engagements(id), workpaper_id uuid REFERENCES workpapers(id), reviewer_id uuid NOT NULL REFERENCES users(id),
 status review_status NOT NULL DEFAULT 'PENDING', comments text, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE signoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), engagement_id uuid NOT NULL REFERENCES engagements(id), reviewed_by uuid NOT NULL REFERENCES users(id), role membership_role NOT NULL,
 status review_status NOT NULL DEFAULT 'PENDING', statement text NOT NULL, signed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), engagement_id uuid NOT NULL REFERENCES engagements(id), version integer NOT NULL CHECK(version>0), status review_status NOT NULL DEFAULT 'PENDING',
 report_type text NOT NULL, content jsonb NOT NULL, generated_by uuid NOT NULL REFERENCES users(id), approved_by uuid REFERENCES users(id), approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(engagement_id,version)
);
CREATE TABLE audit_freezes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), engagement_id uuid NOT NULL REFERENCES engagements(id), version integer NOT NULL CHECK(version>0), frozen_by uuid NOT NULL REFERENCES users(id),
 frozen_at timestamptz NOT NULL DEFAULT now(), freeze_reason text NOT NULL, snapshot_hash char(64) NOT NULL CHECK(snapshot_hash ~ '^[0-9a-fA-F]{64}$'), UNIQUE(engagement_id,version)
);

CREATE TABLE audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), actor_user_id uuid REFERENCES users(id), action text NOT NULL,
 entity_type text NOT NULL, entity_id uuid, timestamp timestamptz NOT NULL DEFAULT now(), ip_address inet, user_agent text, request_id uuid NOT NULL,
 old_values jsonb, new_values jsonb, metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_logs_org_time_idx ON audit_logs(organization_id,timestamp DESC);
CREATE TABLE domain_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), event_type text NOT NULL, aggregate_type text NOT NULL, aggregate_id uuid NOT NULL,
 actor_user_id uuid REFERENCES users(id), payload jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), request_id uuid NOT NULL
);
CREATE INDEX domain_events_org_time_idx ON domain_events(organization_id,occurred_at DESC);
CREATE TABLE notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), recipient_user_id uuid NOT NULL REFERENCES users(id), event_type text NOT NULL,
 title text NOT NULL, body text NOT NULL, status text NOT NULL DEFAULT 'UNREAD', created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
);
CREATE TABLE ai_generations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), engagement_id uuid REFERENCES engagements(id), source_type text NOT NULL,
 source_reference text, prompt_version text NOT NULL, model_provider text NOT NULL, model_name text NOT NULL, model_version text, input_hash char(64) NOT NULL,
 output jsonb NOT NULL, confidence numeric(5,4) CHECK(confidence IS NULL OR (confidence>=0 AND confidence<=1)), review_status ai_review_status NOT NULL DEFAULT 'GENERATED',
 created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz,
 CHECK(input_hash ~ '^[0-9a-fA-F]{64}$')
);
CREATE TABLE data_lineage (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), source_type text NOT NULL, source_id uuid NOT NULL,
 target_type text NOT NULL, target_id uuid NOT NULL, relationship text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

-- Deterministic engagement lifecycle: PLANNING -> TESTING -> REVIEW -> CLOSED;
-- PLANNING/TESTING may also close directly per the current truth table.
CREATE FUNCTION enforce_engagement_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status = NEW.status THEN RETURN NEW; END IF;
 IF (OLD.status='PLANNING' AND NEW.status IN ('TESTING','CLOSED')) OR
    (OLD.status='TESTING' AND NEW.status IN ('REVIEW','CLOSED')) OR
    (OLD.status='REVIEW' AND NEW.status='CLOSED') THEN RETURN NEW; END IF;
 RAISE EXCEPTION 'Invalid engagement status transition: % -> %', OLD.status, NEW.status;
END $$;
CREATE TRIGGER engagements_status_transition BEFORE UPDATE OF status ON engagements FOR EACH ROW EXECUTE FUNCTION enforce_engagement_transition();

-- Append-only assurance history. DB owners can still administer schema; application roles
-- should additionally receive no UPDATE/DELETE privileges on these tables.
CREATE FUNCTION reject_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END $$;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER domain_events_append_only BEFORE UPDATE OR DELETE ON domain_events FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER workpaper_versions_append_only BEFORE UPDATE OR DELETE ON workpaper_versions FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER audit_freezes_append_only BEFORE UPDATE OR DELETE ON audit_freezes FOR EACH ROW EXECUTE FUNCTION reject_mutation();

-- Frozen engagements are immutable through ordinary updates. Controlled corrections must
-- create a superseding version/event rather than silently rewrite historical state.
CREATE FUNCTION reject_frozen_engagement_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.frozen_at IS NOT NULL AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN RAISE EXCEPTION 'Frozen engagement % cannot be mutated', OLD.id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER engagements_freeze_guard BEFORE UPDATE ON engagements FOR EACH ROW EXECUTE FUNCTION reject_frozen_engagement_mutation();

CREATE FUNCTION reject_frozen_workpaper_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.frozen_at IS NOT NULL AND ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN RAISE EXCEPTION 'Frozen workpaper % cannot be mutated', OLD.id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER workpapers_freeze_guard BEFORE UPDATE ON workpapers FOR EACH ROW EXECUTE FUNCTION reject_frozen_workpaper_mutation();

COMMENT ON TABLE audit_logs IS 'Append-only audit history; application roles must not receive UPDATE/DELETE.';
COMMENT ON COLUMN engagements.organization_id IS 'Tenant ownership is derived from authenticated membership, never arbitrary client headers.';
COMMENT ON COLUMN evidence.sha256 IS 'SHA-256 digest of immutable evidence bytes at ingestion.';
COMMENT ON TABLE ai_generations IS 'AI assistance provenance only; never authoritative compliance truth or autonomous sign-off.';
