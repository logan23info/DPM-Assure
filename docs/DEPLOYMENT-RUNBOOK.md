# DPM-Assure Deployment and Rollback Runbook

Status: production launch control. This runbook must be used with `PRODUCTION-READINESS.md`, `RELEASE-GATES.md`, `DATABASE-SECURITY-MODEL.md`, and the Project Constitution.

## Release ownership

Every production release must name a release operator, migration operator, verification owner, and rollback decision owner. The schema-owner credential is used only for forward-only migrations. The web application uses a separate non-owner, non-superuser, non-`BYPASSRLS` runtime role.

## Pre-deployment gate

Do not deploy unless Database Contract, TypeScript Contract, Application Contract, Browser E2E, Release Smoke, and Recovery Contract are green for the release candidate. Confirm the candidate is not behind `main`, review the migration set, record the current production application revision and database migration level, verify a recent recoverable database backup, and verify evidence-object recovery/versioning is operational.

Validate all required runtime variables without printing their values. Confirm `APP_BASE_URL` is the exact public HTTPS origin, the evidence bucket is private, signed URL TTLs and upload-size limits are intentional, and email/AI/object-store credentials are scoped to the production environment.

## Deployment sequence

1. Put a change record/release identifier in the operational log.
2. Take or confirm the required pre-release database backup and record its recovery reference outside the application repository.
3. Apply SQL migrations using the migration owner credential. Never run migrations with the application runtime role.
4. Run the Database Contract against the migrated production-equivalent schema where policy permits.
5. Deploy the immutable application revision with the runtime credential.
6. Run readiness checks: `/api/health`, login request/verification, organization discovery, tenant denial, private evidence signed upload/finalization/download, and one non-destructive authorization check.
7. Confirm error/uptime/email/storage/database monitors are receiving signals without secrets or evidence contents.
8. Promote traffic only after all checks pass.
9. Record release revision, migration level, verification result, operator, and timestamp.

## Stop / NO-GO conditions

Stop promotion if a migration fails, the runtime role owns protected tables or has `BYPASSRLS`, authentication cannot resolve under the runtime role, cross-tenant access succeeds, evidence storage becomes public, signed upload finalization cannot re-hash the object, required monitoring is unavailable, or any mandatory release gate fails.

Do not weaken RLS, lifecycle triggers, evidence gates, segregation rules, freeze guards, or tests to complete a deployment.

## Application rollback

If the schema is backward compatible with the previous application revision, remove traffic from the defective revision and redeploy the last known-good immutable application revision. Re-run health, authentication, tenant isolation, and critical evidence checks before restoring full traffic.

A rollback must never restore an application version that expects a schema older than an irreversible forward migration. In that case use a forward fix.

## Database recovery / forward fix

SQL migrations are forward-only. Do not automatically run destructive down migrations. For a defective migration, stop traffic if integrity is at risk, preserve logs and the current database, create a reviewed corrective forward migration, test it against a restored copy, run all database behavioral contracts, and then apply it through the normal migration gate.

Restore from backup only for an actual data-loss/corruption recovery decision. A restore requires explicit incident authorization because it may discard post-backup transactions. After restore, prove RLS, append-only history, freeze guards, authentication bootstrap, evidence references, and migration determinism before returning traffic.

## Security incident actions

If credentials or sessions may be compromised, revoke/rotate the affected provider secret independently, invalidate affected sessions/tokens, preserve audit/domain-event history, and do not log the compromised value. If evidence-object integrity is questioned, compare server-computed SHA-256 and custody history and treat unverifiable material as insufficient evidence rather than silently replacing it.

## Post-deployment observation

Observe authentication failures, authorization denials, rate-limit activity, database/storage capacity, object-store errors, email delivery failures, server errors, and health/uptime. Use request IDs and domain/audit identifiers for correlation. Never put session tokens, magic links, invitation tokens, signed object URLs, API keys, database credentials, or evidence contents in logs.

## Required production decisions before public launch

Document and approve database and object-storage providers, backup retention, RPO, RTO, recovery owners, evidence retention, monitoring/error provider, alert routing/on-call owner, production domain/TLS ownership, email sender-domain verification, secret rotation frequency, and pilot rollback criteria.
