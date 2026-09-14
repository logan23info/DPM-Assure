# DPM-Assure

DPM-Assure is a trustworthy, traceable, evidence-driven Data Privacy Audit & Assurance platform.

Its central design rule is simple:

> Everything in DPM-Assure must either establish truth, test truth, provide evidence of truth, make a controlled decision about truth, or record the history of that decision.

No AI output, UI convenience, database shortcut, or workflow shortcut may weaken the traceability, integrity, authorization, or evidentiary basis of an audit conclusion.

## Truth model

DPM-Assure deliberately separates three layers:

1. **Compliance Truth** — authoritative laws, regulations, standards, regulator publications, and professionally governed criteria.
2. **System Truth** — deterministic DPM-Assure workflow rules, state machines, scoring methods, evidence gates, release gates, and authorization rules.
3. **AI-Generated Information** — summaries, extraction, suggestions, interpretations, and drafts that remain non-authoritative until governed review occurs.

AI must be able to return `INSUFFICIENT_EVIDENCE` and cannot autonomously sign off an audit conclusion.

## Assurance lifecycle

```text
SOURCE
→ REQUIREMENT
→ CONTROL
→ ORGANIZATION
→ ENGAGEMENT
→ INDEPENDENCE / CONFLICT CHECK
→ RISK ASSESSMENT
→ AUDIT PLAN
→ FRAMEWORK / SCOPE
→ APPLICABILITY
→ SAMPLING
→ WORKPAPER
→ PROCEDURE
→ PBC / CLIENT REQUEST
→ EVIDENCE
→ AI ASSISTANCE
→ EVIDENCE GATE
→ TEST
→ EXCEPTION
→ FINDING
→ RISK
→ REMEDIATION / RISK ACCEPTANCE
→ RETEST
→ REVIEW / QA
→ SIGN-OFF
→ REPORT
→ AUDIT FREEZE
→ ARCHIVE
→ CONTINUOUS MONITORING
→ CHANGE / NEW EVIDENCE
→ REASSESSMENT
```

Audit logging, security, RBAC, notifications, AI traceability, and data lineage are cross-cutting controls across the entire lifecycle.

## Current implementation status

### Foundation — complete

The project constitution, source-of-truth model, framework governance, audit methodology, domain design, truth tables, rules catalog, testing strategy, evidence gates, release gates, research dossier, and schema decisions are documented under `docs/`.

### Database foundation — frozen

The canonical PostgreSQL v1 foundation is defined under `db/migrations/` and validated against a disposable PostgreSQL 17 instance in GitHub Actions.

The frozen contract includes:

- organization tenancy and membership roles;
- framework/version/requirement/control governance;
- engagements, planning, scope, independence, risk assessment, and sampling;
- workpapers, procedures, PBC requests, evidence, evidence gates, and testing;
- exceptions, findings, risks, remediation, risk acceptance, and retesting;
- review, sign-off, reporting, and audit freeze;
- append-only audit history and domain events;
- notifications, AI generation provenance, and data lineage;
- row-level security and tenant integrity constraints;
- deterministic lifecycle transition enforcement;
- SHA-256 evidence integrity controls.

See `docs/SCHEMA-FREEZE.md` for the formal freeze record.

### Typed database layer — in progress

`src/db/schema.ts` is a Drizzle/TypeScript mirror of the frozen PostgreSQL schema. The SQL migration chain remains authoritative for RLS, triggers, append-only guarantees, tenant integrity, and freeze behavior.

## Repository structure

```text
DPM-Assure/
├── .github/workflows/
│   ├── database-contract.yml
│   └── typecheck.yml
├── data/
│   ├── sources.json
│   ├── frameworks.json
│   ├── requirements.json
│   ├── controls.json
│   └── mappings.json
├── db/
│   ├── migrations/
│   ├── tests/
│   └── README.md
├── docs/
├── src/
│   └── db/
│       └── schema.ts
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

## Development principles

- Never trust client-supplied tenant or actor headers as authorization truth.
- Tenant context comes from authenticated membership and is reinforced with PostgreSQL RLS.
- Historical audit evidence is append-only where required.
- Frozen assurance records cannot be silently rewritten.
- Legal or standards requirements remain traceable to authoritative sources and versions.
- DPM-derived controls are never presented as law.
- Cross-framework mappings are reviewed relationships, not assumed equivalence.
- AI assistance preserves model, input, output, review, and publication provenance.
- Human authorization remains mandatory for sign-off and controlled assurance conclusions.
- Development and CI use disposable databases, not production data.

## Database validation

The database contract workflow applies every SQL migration to a clean PostgreSQL 17 database, runs executable schema assertions, then repeats the migration/test sequence against a second clean database to detect non-determinism.

The TypeScript contract separately validates the Drizzle application mirror under strict TypeScript settings.

## Next implementation phase

After the typed schema mirror is green in CI, the project proceeds to the application foundation: secure session/authentication architecture, organization context, RBAC authorization primitives, database transaction context, domain-event scaffolding, and then the first engagement workflow slice.
