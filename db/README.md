# Database

`migrations/0001_foundation.sql` is the canonical PostgreSQL foundation migration for DPM-Assure.

## Contract

- Application/API code must use the canonical field names in `docs/DATABASE-SCHEMA.md`.
- Tenant ownership comes from authenticated organization membership, never client-supplied actor/tenant headers.
- Engagement lifecycle transitions are enforced in PostgreSQL.
- Evidence records require a 64-character SHA-256 digest.
- Audit logs, domain events, workpaper versions, and audit freezes are append-only.
- Frozen engagements/workpapers cannot be silently mutated.
- AI generations preserve model/input/review provenance and cannot substitute for authoritative sources or human sign-off.
- Application database roles must not receive UPDATE/DELETE privileges on append-only history tables.

## Migration validation before application scaffolding

Run the migration against a disposable PostgreSQL database and verify:

1. Clean install succeeds in one transaction.
2. Every foreign key resolves and all required indexes/unique constraints exist.
3. Invalid engagement state transitions fail.
4. UPDATE/DELETE against append-only tables fail.
5. Invalid evidence/input/snapshot hashes fail.
6. Frozen engagement/workpaper mutation fails.
7. Cross-tenant access is denied by the application authorization layer and, when RLS is introduced, by database policy as defense in depth.
8. Schema names match the API contract exactly (`engagements.name`, `workpaper_versions.changed_by`, `workpaper_versions.changed_at`, `signoffs.reviewed_by`, `audit_logs.actor_user_id`).

No production database should be used for development validation.
