# DPM-Assure PostgreSQL Schema Specification

This document is the schema freeze candidate. Application code must conform to this model; APIs must not invent alternate field names or statuses.

## Identity and tenancy

### organizations
`id`, `name`, `slug`, `status`, `created_at`, `updated_at`

### users
`id`, `email`, `display_name`, `status`, `created_at`, `updated_at`

### memberships
`id`, `organization_id`, `user_id`, `role`, `status`, `created_at`, `updated_at`

Unique `(organization_id, user_id)`.

### clients
`id`, `organization_id`, `name`, `status`, `created_at`, `updated_at`

## Governance

### sources
`id`, `source_id`, `authority`, `type`, `title`, `edition`, `status`, `jurisdiction`, `source_url`, `published_at`, `effective_at`, `retired_at`, `last_validated_at`, `validated_by`, `next_review_at`, `license_notes`, `intended_use`, `created_at`, `updated_at`

### frameworks
`id`, `framework_key`, `name`, `authority`, `status`, `created_at`, `updated_at`

### framework_versions
`id`, `framework_id`, `version`, `status`, `published_at`, `effective_at`, `retired_at`, `source_id`, `source_url`, `validated_at`, `validated_by`, `created_at`, `updated_at`

Unique `(framework_id, version)`.

### requirements
`id`, `framework_version_id`, `requirement_key`, `title`, `description`, `classification`, `section_reference`, `applicability`, `test_procedure`, `expected_evidence`, `created_at`, `updated_at`

### controls
`id`, `organization_id`, `control_key`, `title`, `description`, `control_type`, `objective`, `test_procedure`, `expected_evidence`, `status`, `created_at`, `updated_at`

Controls that are globally reusable may use a nullable organization owner only where the authorization model explicitly permits it.

### control_requirement_mappings
`id`, `control_id`, `requirement_id`, `relationship`, `coverage`, `rationale`, `source_reference`, `reviewer_id`, `reviewed_at`, `effective_at`, `retired_at`, `created_at`, `updated_at`

## Assurance

### engagements
`id`, `organization_id`, `client_id`, `name`, `description`, `status`, `start_date`, `end_date`, `lead_auditor_id`, `created_by`, `created_at`, `updated_at`, `frozen_at`

Allowed status transitions are defined in `docs/TRUTH-TABLES.md`.

### engagement_frameworks
`id`, `engagement_id`, `framework_version_id`, `applicability_status`, `rationale`, `reviewed_by`, `reviewed_at`

### scopes
`id`, `engagement_id`, `name`, `description`, `in_scope`, `owner`, `created_at`, `updated_at`

### independence_checks
`id`, `engagement_id`, `subject_user_id`, `result`, `conflict_details`, `resolved_by`, `resolved_at`, `created_at`

### risk_assessments
`id`, `engagement_id`, `method_version`, `inherent_score`, `control_score`, `residual_score`, `rationale`, `assessed_by`, `assessed_at`

### audit_plans
`id`, `engagement_id`, `version`, `status`, `objectives`, `scope_summary`, `sampling_approach`, `approved_by`, `approved_at`, `created_by`, `created_at`

### samples
`id`, `engagement_id`, `workpaper_id`, `population_description`, `population_size`, `sampling_method`, `sample_size`, `selection_basis`, `created_by`, `created_at`

## Execution

### workpapers
`id`, `organization_id`, `engagement_id`, `control_id`, `title`, `status`, `prepared_by`, `reviewer_id`, `created_at`, `updated_at`, `frozen_at`

### workpaper_versions
`id`, `workpaper_id`, `version_number`, `content`, `changed_by`, `changed_at`, `change_reason`

### procedures
`id`, `workpaper_id`, `name`, `description`, `procedure_type`, `sequence`, `expected_result`, `created_at`, `updated_at`

### pbc_requests
`id`, `engagement_id`, `workpaper_id`, `requested_by`, `assigned_to`, `title`, `description`, `status`, `due_at`, `fulfilled_at`, `created_at`, `updated_at`

### evidence
`id`, `organization_id`, `engagement_id`, `workpaper_id`, `procedure_id`, `filename`, `mime_type`, `size_bytes`, `storage_key`, `sha256`, `uploaded_by`, `uploaded_at`, `retention_until`, `source_description`, `chain_of_custody_ref`, `status`

### evidence_gate_results
`id`, `evidence_id`, `gate_version`, `identity_status`, `provenance_status`, `integrity_status`, `authorization_status`, `applicability_status`, `temporal_status`, `completeness_status`, `overall_result`, `evaluated_by`, `evaluated_at`, `rationale`

### test_results
`id`, `workpaper_id`, `procedure_id`, `evidence_gate_result_id`, `result`, `exception_summary`, `conclusion`, `tested_by`, `tested_at`

## Outcomes

### exceptions
`id`, `organization_id`, `engagement_id`, `workpaper_id`, `test_result_id`, `description`, `severity`, `status`, `created_by`, `created_at`

### findings
`id`, `organization_id`, `engagement_id`, `exception_id`, `title`, `description`, `finding_type`, `status`, `risk_id`, `created_by`, `created_at`, `updated_at`

### risks
`id`, `organization_id`, `engagement_id`, `finding_id`, `likelihood`, `impact`, `score`, `method_version`, `rationale`, `assessed_by`, `assessed_at`

### remediations
`id`, `finding_id`, `owner_user_id`, `plan`, `status`, `target_date`, `completed_at`, `created_at`, `updated_at`

### risk_acceptances
`id`, `finding_id`, `accepted_by`, `rationale`, `accepted_at`, `expires_at`, `review_due_at`, `status`

### retests
`id`, `finding_id`, `remediation_id`, `result`, `evidence_id`, `tested_by`, `tested_at`, `conclusion`

## Review and closure

### reviews
`id`, `engagement_id`, `workpaper_id`, `reviewer_id`, `status`, `comments`, `reviewed_at`, `created_at`

### signoffs
`id`, `engagement_id`, `reviewed_by`, `role`, `status`, `statement`, `signed_at`, `created_at`

### reports
`id`, `engagement_id`, `version`, `status`, `report_type`, `content`, `generated_by`, `approved_by`, `approved_at`, `created_at`, `updated_at`

### audit_freezes
`id`, `engagement_id`, `version`, `frozen_by`, `frozen_at`, `freeze_reason`, `snapshot_hash`

## Cross-cutting

### audit_logs
`id`, `organization_id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `timestamp`, `ip_address`, `user_agent`, `request_id`, `old_values`, `new_values`, `metadata`

Append-only. Application roles do not receive update/delete permissions.

### domain_events
`id`, `organization_id`, `event_type`, `aggregate_type`, `aggregate_id`, `actor_user_id`, `payload`, `occurred_at`, `request_id`

### notifications
`id`, `organization_id`, `recipient_user_id`, `event_type`, `title`, `body`, `status`, `created_at`, `read_at`

### ai_generations
`id`, `organization_id`, `engagement_id`, `source_type`, `source_reference`, `prompt_version`, `model_provider`, `model_name`, `model_version`, `input_hash`, `output`, `confidence`, `review_status`, `created_by`, `created_at`, `reviewed_by`, `reviewed_at`

### data_lineage
`id`, `organization_id`, `source_type`, `source_id`, `target_type`, `target_id`, `relationship`, `created_at`

## Schema invariants

1. Organization-owned data is tenant-scoped.
2. Foreign keys prevent orphaned assurance records.
3. Historical versions are preserved where required.
4. Audit logs are append-only.
5. SHA-256 is recorded for evidence integrity.
6. Frozen engagements cannot be silently changed.
7. AI records preserve generation and review provenance.
8. Status values are enumerated centrally and transitions are deterministic.
