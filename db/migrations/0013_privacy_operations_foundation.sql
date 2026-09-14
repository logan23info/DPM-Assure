-- DPM-Assure privacy operations foundation
-- Forward-only migration. Operational records remain distinct from authoritative requirements and assurance conclusions.

CREATE TYPE privacy_record_state AS ENUM ('DRAFT','ACTIVE','UNDER_REVIEW','CLOSED','ARCHIVED');
CREATE TYPE dpia_decision AS ENUM ('NOT_REQUIRED','REQUIRED','IN_PROGRESS','APPROVED','REJECTED');
CREATE TYPE processor_status AS ENUM ('PROSPECTIVE','ACTIVE','SUSPENDED','TERMINATED');
CREATE TYPE transfer_mechanism AS ENUM ('ADEQUACY','SCC','BCR','DEROGATION','OTHER');
CREATE TYPE dsr_status AS ENUM ('RECEIVED','IDENTITY_VERIFICATION','IN_PROGRESS','ON_HOLD','COMPLETED','REJECTED','CANCELLED');
CREATE TYPE breach_status AS ENUM ('DETECTED','TRIAGE','INVESTIGATING','CONTAINED','NOTIFICATION_ASSESSMENT','NOTIFIED','CLOSED');

CREATE TABLE processing_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  client_id uuid REFERENCES clients(id),
  name text NOT NULL,
  purpose text NOT NULL,
  controller_processor_role text NOT NULL CHECK (controller_processor_role IN ('CONTROLLER','PROCESSOR','JOINT_CONTROLLER')),
  data_subject_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  personal_data_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  special_category_data boolean NOT NULL DEFAULT false,
  lawful_basis text,
  recipients jsonb NOT NULL DEFAULT '[]'::jsonb,
  retention_summary text,
  security_measures_summary text,
  state privacy_record_state NOT NULL DEFAULT 'DRAFT',
  owner_user_id uuid REFERENCES users(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id)
);

CREATE TABLE dpia_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  processing_activity_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  screening_rationale text NOT NULL,
  decision dpia_decision NOT NULL,
  risk_summary text,
  mitigation_summary text,
  residual_risk text,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (processing_activity_id, organization_id) REFERENCES processing_activities(id, organization_id),
  UNIQUE (processing_activity_id, version),
  CHECK ((decision = 'APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL) OR decision <> 'APPROVED')
);

CREATE TABLE processors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  service_description text NOT NULL,
  status processor_status NOT NULL DEFAULT 'PROSPECTIVE',
  country text,
  contract_reference text,
  dpa_reference text,
  security_review_status text,
  owner_user_id uuid REFERENCES users(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id),
  UNIQUE (organization_id, name)
);

CREATE TABLE processing_activity_processors (
  processing_activity_id uuid NOT NULL,
  processor_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (processing_activity_id, processor_id),
  FOREIGN KEY (processing_activity_id, organization_id) REFERENCES processing_activities(id, organization_id),
  FOREIGN KEY (processor_id, organization_id) REFERENCES processors(id, organization_id)
);

CREATE TABLE international_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  processing_activity_id uuid NOT NULL,
  processor_id uuid,
  destination_country text NOT NULL,
  mechanism transfer_mechanism NOT NULL,
  mechanism_reference text,
  transfer_risk_assessment_reference text,
  supplementary_measures text,
  state privacy_record_state NOT NULL DEFAULT 'DRAFT',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (processing_activity_id, organization_id) REFERENCES processing_activities(id, organization_id),
  FOREIGN KEY (processor_id, organization_id) REFERENCES processors(id, organization_id)
);

CREATE TABLE retention_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  processing_activity_id uuid NOT NULL,
  data_category text NOT NULL,
  retention_period text NOT NULL,
  trigger_event text NOT NULL,
  disposal_method text,
  legal_basis_reference text,
  state privacy_record_state NOT NULL DEFAULT 'ACTIVE',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (processing_activity_id, organization_id) REFERENCES processing_activities(id, organization_id)
);

CREATE TABLE privacy_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  notice_key text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL,
  effective_at timestamptz,
  retired_at timestamptz,
  content_hash char(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  storage_reference text NOT NULL,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, notice_key, version),
  CHECK (retired_at IS NULL OR effective_at IS NULL OR retired_at >= effective_at)
);

CREATE TABLE consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  processing_activity_id uuid,
  subject_reference_hash char(64) NOT NULL CHECK (subject_reference_hash ~ '^[0-9a-f]{64}$'),
  purpose text NOT NULL,
  status text NOT NULL CHECK (status IN ('GIVEN','WITHDRAWN','EXPIRED')),
  notice_id uuid REFERENCES privacy_notices(id),
  captured_at timestamptz NOT NULL,
  withdrawn_at timestamptz,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (processing_activity_id, organization_id) REFERENCES processing_activities(id, organization_id),
  CHECK (withdrawn_at IS NULL OR withdrawn_at >= captured_at)
);

CREATE TABLE data_subject_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  request_type text NOT NULL,
  subject_reference_hash char(64) NOT NULL CHECK (subject_reference_hash ~ '^[0-9a-f]{64}$'),
  received_at timestamptz NOT NULL,
  due_at timestamptz,
  status dsr_status NOT NULL DEFAULT 'RECEIVED',
  identity_verified_at timestamptz,
  assigned_to uuid REFERENCES users(id),
  outcome text,
  closed_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_at IS NULL OR due_at >= received_at),
  CHECK (closed_at IS NULL OR closed_at >= received_at)
);

CREATE TABLE privacy_breaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  title text NOT NULL,
  detected_at timestamptz NOT NULL,
  occurred_at timestamptz,
  status breach_status NOT NULL DEFAULT 'DETECTED',
  description text NOT NULL,
  data_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_subjects_estimate bigint CHECK (affected_subjects_estimate IS NULL OR affected_subjects_estimate >= 0),
  severity text,
  containment_summary text,
  notification_required boolean,
  notification_rationale text,
  authority_notified_at timestamptz,
  subjects_notified_at timestamptz,
  owner_user_id uuid REFERENCES users(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (occurred_at IS NULL OR occurred_at <= detected_at),
  CHECK (notification_required IS NULL OR notification_rationale IS NOT NULL)
);

-- Privacy operations can be linked to assurance without rewriting operational truth.
CREATE TABLE privacy_assurance_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  engagement_id uuid NOT NULL,
  privacy_record_type text NOT NULL CHECK (privacy_record_type IN ('PROCESSING_ACTIVITY','DPIA','PROCESSOR','TRANSFER','RETENTION_RULE','NOTICE','CONSENT','DSR','BREACH')),
  privacy_record_id uuid NOT NULL,
  rationale text NOT NULL,
  linked_by uuid NOT NULL REFERENCES users(id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (engagement_id, organization_id) REFERENCES engagements(id, organization_id),
  UNIQUE (engagement_id, privacy_record_type, privacy_record_id)
);

-- Tenant isolation. The generic direct organization policy is deliberate here; all records also carry same-tenant FKs where relationships exist.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['processing_activities','dpia_assessments','processors','processing_activity_processors','international_transfers','retention_rules','privacy_notices','consent_records','data_subject_requests','privacy_breaches','privacy_assurance_links']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (organization_id = app_current_organization_id() AND app_is_current_org_member()) WITH CHECK (organization_id = app_current_organization_id() AND app_is_current_org_member())', t || '_tenant_policy', t);
  END LOOP;
END $$;

CREATE INDEX processing_activities_org_state_idx ON processing_activities(organization_id, state);
CREATE INDEX dpia_activity_idx ON dpia_assessments(processing_activity_id, version DESC);
CREATE INDEX processors_org_status_idx ON processors(organization_id, status);
CREATE INDEX transfers_org_activity_idx ON international_transfers(organization_id, processing_activity_id);
CREATE INDEX retention_activity_idx ON retention_rules(processing_activity_id);
CREATE INDEX consent_subject_idx ON consent_records(organization_id, subject_reference_hash);
CREATE INDEX dsr_org_status_due_idx ON data_subject_requests(organization_id, status, due_at);
CREATE INDEX breaches_org_status_idx ON privacy_breaches(organization_id, status);
CREATE INDEX privacy_assurance_engagement_idx ON privacy_assurance_links(engagement_id);
