# Database Security Model

This document defines the PostgreSQL trust boundary for DPM-Assure.

## Database principals

DPM-Assure uses two distinct database trust levels:

1. **Schema / migration owner** — trusted provisioning principal used only for migrations, controlled bootstrap, and global source/control-library administration.
2. **Runtime application role** — non-owner role used by the Next.js application. It MUST NOT own application tables, MUST NOT have `BYPASSRLS`, and MUST NOT be a PostgreSQL superuser.

The runtime application must never connect using the schema-owner credential.

## Authenticated transaction context

After the application authenticates a user and selects an active organization membership, every tenant transaction sets transaction-local context:

```sql
SET LOCAL app.user_id = '<authenticated-user-uuid>';
SET LOCAL app.organization_id = '<selected-organization-uuid>';
```

These values are derived exclusively from the authenticated server-side session. Request headers, form values, query parameters, browser storage, or other client-controlled values are never accepted directly as authorization truth.

RLS then verifies that the user has an ACTIVE membership in the selected organization.

## RLS design

RLS is enabled on tenant-owned and assurance-domain tables. Policies follow one of three patterns:

- direct ownership via `organization_id`;
- inherited ownership through an engagement/workpaper/finding relationship;
- global-or-tenant ownership for the control library.

Cross-tenant composite foreign keys additionally prevent rows whose `organization_id` belongs to one tenant from referencing a parent owned by another tenant.

RLS is defense in depth, not the only authorization layer. RBAC/segregation-of-duties checks remain mandatory in the application domain layer.

## Provisioning boundary

The schema owner may bypass RLS on selected root tables because PostgreSQL table owners normally bypass non-FORCE RLS. This is intentional for:

- first-user/first-organization bootstrap;
- controlled membership provisioning;
- migration operations;
- globally reusable control-library seeding.

This exception is safe only when the schema-owner credential is isolated from runtime execution.

## Append-only and historical controls

`audit_logs`, `domain_events`, `workpaper_versions`, and `audit_freezes` reject UPDATE/DELETE through database triggers. Runtime roles should additionally receive no UPDATE/DELETE grants on append-only tables.

Frozen engagements and workpapers reject ordinary mutation. Corrections must create controlled superseding versions/events rather than rewriting audit history.

## Release gate

Production deployment is blocked unless all of the following are proven:

- runtime DB role differs from schema owner;
- runtime role is not superuser and does not have `BYPASSRLS`;
- authenticated requests set transaction-local user and organization context server-side;
- cross-tenant positive/negative tests pass;
- missing or invalid tenant context returns no tenant data;
- append-only mutation tests fail as expected;
- frozen-record mutation tests fail as expected;
- application RBAC tests pass independently of RLS.
