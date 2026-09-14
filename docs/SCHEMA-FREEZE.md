# DPM-Assure Schema Freeze

## Status

**FROZEN — Foundation schema v1**

The database foundation is frozen for application scaffolding as of the validated `main` commit:

- Freeze baseline: `d7931ddc8d055464f6718624a7c1b9f47ca5ae22`
- Validation workflow: `Database Contract`
- Workflow run: `34814774406`
- PostgreSQL validation target: PostgreSQL 17
- Result: **PASS**
- Validated on: 2026-09-14

## Authoritative artifacts

The following artifacts define the v1 database contract:

1. `docs/DATABASE-SCHEMA.md`
2. `docs/SCHEMA-DECISIONS.md`
3. `docs/DATABASE-SECURITY-MODEL.md`
4. `docs/TRUTH-TABLES.md`
5. `db/migrations/0001_foundation.sql`
6. `db/migrations/0002_tenant_rls.sql`
7. `db/migrations/0003_tenant_integrity.sql`
8. `db/migrations/0004_provisioning_boundaries.sql`
9. `db/tests/001_schema_contract.sql`
10. `.github/workflows/database-contract.yml`

## Freeze rules

- Application code MUST conform to the frozen database names, constraints, statuses, and lifecycle rules.
- The SQL migration chain is authoritative for database behavior. ORM definitions are a typed application mirror and MUST NOT silently redefine RLS, triggers, append-only rules, tenant integrity, or freeze behavior.
- Any change to a frozen table, enum, lifecycle transition, RLS policy, integrity constraint, append-only control, or canonical field name requires:
  1. a new forward-only migration;
  2. an update to the database specification;
  3. an update to executable contract tests;
  4. a successful clean-database CI run;
  5. a documented schema decision.
- Historical migrations are immutable after release. Corrections are made through new migrations.
- No production database is used to generate, test, or validate development migrations.

## Canonical naming locked at freeze

- Engagement display name: `engagements.name`
- Workpaper version actor: `workpaper_versions.changed_by`
- Workpaper version timestamp: `workpaper_versions.changed_at`
- Sign-off reviewer: `signoffs.reviewed_by`
- Audit actor: `audit_logs.actor_user_id`

## Application-layer consequence

The next implementation layer is a Drizzle/TypeScript mirror of this frozen contract. It exists for type-safe queries and application development. Database security invariants remain enforced by PostgreSQL migrations and tests.
