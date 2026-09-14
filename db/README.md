# Database

The `db/` directory is the canonical PostgreSQL implementation of the DPM-Assure schema contract.

## Migration order

1. `migrations/0001_foundation.sql` — canonical assurance schema, enums, evidence hashing, lifecycle guards, append-only history.
2. `migrations/0002_tenant_rls.sql` — authenticated tenant context and PostgreSQL row-level-security policies.
3. `migrations/0003_tenant_integrity.sql` — composite foreign keys that prevent cross-tenant parent/child references and preserve evidence/test/finding lineage.
4. `migrations/0004_provisioning_boundaries.sql` — separates trusted schema-owner provisioning from the non-owner runtime application role.

After migrations, run `tests/001_schema_contract.sql` against a disposable PostgreSQL database. A failed assertion blocks schema freeze and application scaffolding.

## Contract

- Application/API code must use the canonical field names in `docs/DATABASE-SCHEMA.md`.
- Tenant ownership comes from authenticated organization membership, never client-supplied actor/tenant headers.
- Runtime transactions set `app.user_id` and `app.organization_id` from the authenticated server-side session with `SET LOCAL`.
- The runtime database principal must be a non-owner role without `BYPASSRLS`; it must never use the schema-owner credential.
- Engagement lifecycle transitions are enforced in PostgreSQL.
- Evidence records require a 64-character SHA-256 digest.
- Cross-tenant parent/child references are rejected through composite foreign keys where tenant ownership is explicit.
- Audit logs, domain events, workpaper versions, and audit freezes are append-only.
- Frozen engagements/workpapers cannot be silently mutated.
- AI generations preserve model/input/review provenance and cannot substitute for authoritative sources or human sign-off.
- Application database roles must not receive UPDATE/DELETE privileges on append-only history tables.

See `docs/DATABASE-SECURITY-MODEL.md` for the database trust boundary and release gates.

## Validation before application scaffolding

Run all migrations and the schema contract test against a disposable PostgreSQL database and verify:

1. Clean install succeeds in migration order.
2. `db/tests/001_schema_contract.sql` reports `DPM-Assure schema contract: PASS`.
3. Every foreign key resolves and all required indexes/unique constraints exist.
4. Invalid engagement state transitions fail.
5. UPDATE/DELETE against append-only tables fail.
6. Invalid evidence/input/snapshot hashes fail.
7. Frozen engagement/workpaper mutation fails.
8. Cross-tenant positive/negative access tests fail closed under the non-owner runtime role.
9. Missing or invalid tenant context exposes no tenant records.
10. Schema names match the API contract exactly (`engagements.name`, `workpaper_versions.changed_by`, `workpaper_versions.changed_at`, `signoffs.reviewed_by`, `audit_logs.actor_user_id`).

No production database should be used for development validation.
