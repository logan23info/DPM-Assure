# Domain Design

DPM-Assure is organized around assurance domains rather than pages.

## Core domains

- Identity, organizations, memberships, RBAC
- Clients and engagements
- Frameworks, requirements, controls, mappings
- Scope and applicability
- Risk and audit planning
- Sampling
- Workpapers and procedures
- Evidence and chain of custody
- Tests and conclusions
- Exceptions and findings
- Remediation and risk acceptance
- Review, QA and sign-off
- Reports and audit freeze
- Immutable audit history
- Privacy operations
- Continuous monitoring
- AI assistance and AI traceability
- Notifications and escalations
- Data lineage

## Core aggregates

`Organization`, `Engagement`, `FrameworkVersion`, `Requirement`, `Control`, `Workpaper`, `Evidence`, `TestResult`, `Finding`, `Remediation`, `Review`, `Signoff`, and `Report` are independently governed aggregates with explicit organization ownership where applicable.

## Cross-cutting capabilities

Authentication, authorization, tenant isolation, audit logging, notifications, AI traceability, data lineage, and evidence integrity are pervasive capabilities. They are not optional lifecycle steps.

## Invariants

- Every protected organization-owned record is tenant-scoped.
- Every privileged action is authorization-checked server-side.
- Historical versions are retained where audit integrity requires them.
- Audit logs are append-only.
- Evidence identity and hash are preserved.
- Frozen engagements cannot be silently mutated.
- AI output has provenance and review state.
