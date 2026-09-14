# DPM-Assure Project Constitution

## Mission
DPM-Assure is a trustworthy, traceable, evidence-driven Data Privacy Audit & Assurance platform. It must preserve the evidentiary basis and historical integrity of every assurance conclusion.

## Three Truth Layers
1. **Compliance Truth** — authoritative laws, regulations, official standards, and regulator sources.
2. **DPM/System Truth** — deterministic product rules, workflow states, scoring, gates, and methodology.
3. **AI-Generated Information** — summaries, suggestions, interpretations, and drafts. AI output is never authoritative by itself.

These layers must remain visibly and technically separate.

## Traceability
Every authoritative requirement must be traceable to its authority, document/version/edition, section/article, jurisdiction, publication/effective/retirement dates, source URL, and validation metadata.

## Research and Governance
Research Dossiers and the Framework Version Register are first-class artifacts. Frameworks must be versioned, status-aware, jurisdiction-aware, and never silently replaced.

## Control Library
Controls must distinguish legal requirements, regulatory guidance, standard requirements, audit criteria, and implementation guidance. DPM-derived controls must never be represented as law.

## Assurance Chain
The master lifecycle is:

`SOURCE → REQUIREMENT → CONTROL → ORGANIZATION → ENGAGEMENT → INDEPENDENCE/CONFLICT CHECK → RISK ASSESSMENT → AUDIT PLAN → FRAMEWORK/SCOPE → APPLICABILITY → SAMPLING → WORKPAPER → PROCEDURE → PBC/CLIENT REQUEST → EVIDENCE → AI ASSISTANCE → EVIDENCE GATE → TEST → EXCEPTION → FINDING → RISK → REMEDIATION/RISK ACCEPTANCE → RETEST → REVIEW/QA → SIGN-OFF → REPORT → AUDIT FREEZE → ARCHIVE → CONTINUOUS MONITORING → CHANGE/NEW EVIDENCE → REASSESSMENT`

## Security and Authorization
DPM-Assure requires real authentication, tenant isolation, RBAC, segregation of duties, secure sessions, authorization at every protected boundary, and server-side enforcement. Client-controlled identity headers are never trusted as authentication.

Initial roles: `SUPER_ADMIN`, `ORG_ADMIN`, `AUDIT_MANAGER`, `LEAD_AUDITOR`, `AUDITOR`, `REVIEWER`, `CLIENT`, `VIEWER`.

## Evidence Integrity
Evidence must have provenance, uploader identity, timestamps, retention metadata, storage identity, and a cryptographic SHA-256 hash. Evidence operations must preserve chain of custody and historical integrity.

## Evidence Gate
No audit conclusion may rely on evidence that fails the applicable Evidence Gate. Missing or insufficient evidence must be explicit rather than silently bypassed.

## Findings and Risk
Observation, exception, finding, risk, remediation, and risk acceptance are separate concepts with controlled transitions. Risk acceptance requires authorization, rationale, expiry/review date, and audit history.

## Review and Sign-off
Review and QA are independent workflow stages. Audit sign-off is a human authorization event enforced by deterministic rules. AI can assist but cannot sign off autonomously.

## Audit Freeze
A finalized audit enters an immutable/frozen state. Post-freeze changes require controlled superseding events or versions; historical records are not silently mutated.

## Audit Trail
Audit logs are append-only and capture actor, action, entity, timestamp, request context, and relevant before/after values. Domain events drive audit logging and notifications.

## Privacy Operations
The platform must support privacy operational workflows including RoPA, DPIA/PIA, processors, transfers, retention, consent, notices, data-subject requests, and breach management.

## AI/Groq Constitution
Groq is an assistance provider, not a source of truth. AI use requires prompt/model/input/output traceability, review state, and human accountability. Unsupported conclusions must be represented as `INSUFFICIENT_EVIDENCE`.

UI must distinguish `Source-backed`, `AI inference`, `Insufficient evidence`, and `Auditor verified`.

## Deterministic Rules
Truth Tables and a Rules Catalog are authoritative for product behavior. Scoring, state transitions, evidence gates, authorization, freeze rules, and release gates must be deterministic and testable.

## Architecture
Use domain-first architecture with reusable scaffolding. Target stack: Next.js + TypeScript + Tailwind/shadcn, Drizzle + PostgreSQL, provider-neutral storage/jobs/email, and secure real authentication.

## Testing
Every important workflow requires positive and negative tests. Authorization bypass, tenant crossover, invalid state transitions, unsupported AI conclusions, evidence integrity failures, and post-freeze mutation are mandatory negative-test categories.

## Release Gates
A release is not production-ready until security, tenant isolation, schema/API alignment, evidence integrity, audit trail, AI traceability, workflow gates, testing, deployment, and documentation gates pass.

## No Silent Mutation
No UI convenience, database shortcut, AI output, or workflow shortcut may silently alter authoritative history or weaken an audit conclusion.

## Ultimate Principle
> Everything in DPM-Assure must either establish truth, test truth, provide evidence of truth, make a controlled decision about truth, or record the history of that decision.

> No AI output, UI convenience, database shortcut, or workflow shortcut may weaken the traceability, integrity, authorization, or evidentiary basis of an audit conclusion.
