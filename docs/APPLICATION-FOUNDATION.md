# DPM-Assure Application Foundation

## Purpose

This document defines the security and architectural boundary for the first Next.js application layer built on the frozen PostgreSQL foundation.

The application must fail closed. Authentication, tenant selection, role authorization, database row-level security, and audit provenance are separate controls that reinforce one another.

## Authentication boundary

`src/auth/session.ts` defines a provider-neutral `SessionResolver` and `AuthenticatedPrincipal` contract.

A principal is accepted only when a real session resolver returns a non-expired authenticated identity. DPM-Assure does not use a development user selector, client-supplied actor header, or arbitrary user ID as authentication truth.

The concrete identity provider is intentionally not selected by this foundation layer. Any provider implementation must:

1. verify the provider/session cryptographically or through the provider's trusted server-side SDK;
2. map the external identity to the canonical DPM-Assure `users.id`;
3. expose only server-verified identity data to `SessionResolver`;
4. support session invalidation and expiry;
5. keep secrets and privileged credentials server-side;
6. document account-linking and lifecycle behavior before production use.

## Tenant authorization boundary

An organization identifier received from a route, URL, cookie, or user selection is a candidate context only. It does not grant access.

For a tenant operation, DPM-Assure:

1. starts a PostgreSQL transaction;
2. sets transaction-local `app.user_id`, `app.organization_id`, and `app.request_id` values;
3. lets PostgreSQL RLS restrict visibility immediately;
4. queries the canonical `memberships` table for an active membership matching the authenticated user and selected organization;
5. checks the membership role against the deterministic RBAC policy;
6. performs the authorized domain operation inside the same transaction.

The application must not derive tenant authority from arbitrary HTTP actor/organization headers.

## Database access rule

Tenant-scoped application services must use `withAuthorizedTenantTransaction` (or a later wrapper that preserves all of its controls).

Direct pool/database access is reserved for narrowly governed infrastructure operations. Application feature code must not bypass transaction-local RLS context merely for convenience.

`src/db/runtime.ts` is server-only. Database credentials must never be exposed to browser/client code.

## RBAC

`src/auth/rbac.ts` is the deterministic application permission policy for the current membership roles defined by the frozen database enum.

Current roles:

- `SUPER_ADMIN`
- `ORG_ADMIN`
- `AUDIT_MANAGER`
- `LEAD_AUDITOR`
- `AUDITOR`
- `REVIEWER`
- `CLIENT`
- `VIEWER`

RBAC is an authorization layer, not a replacement for RLS, membership validation, independence checks, review gates, evidence gates, or lifecycle rules.

A role having a permission does not imply that every object in the tenant is actionable. Domain-specific conditions may further deny an operation.

## Domain events and audit history

A meaningful authorized domain mutation should produce its domain event and audit record in the same PostgreSQL transaction as the state change.

`src/domain/record-event.ts` records:

- organization from the authorized tenant context;
- actor from the authenticated principal;
- request ID from the transaction context;
- domain event type and aggregate;
- audit action/entity;
- old/new values and metadata where appropriate.

Callers must not be allowed to overwrite the authoritative actor or tenant with client-provided values.

Notifications, AI assistance, and downstream processing should consume domain events rather than being embedded as fragile side effects inside unrelated route handlers.

## Request identifiers

Every externally initiated mutation should have a server-generated or trusted-edge request identifier. If an incoming request ID is accepted for correlation, it must be validated and must not be treated as identity or authorization data.

The request ID is persisted in both `domain_events` and `audit_logs` to support traceability.

## Next.js runtime rules

- Use App Router.
- Default server/database operations to the Node.js runtime.
- Keep privileged modules marked `server-only`.
- Prefer Server Components for server-rendered data and Route Handlers/Server Actions only where their semantics fit the operation.
- Do not fetch privileged application data directly from Client Components using database credentials or privileged provider SDKs.
- Authentication and authorization checks must execute server-side for protected operations.

## Testing gates

The application foundation is not ready for promotion unless CI proves:

1. strict TypeScript compilation succeeds;
2. deterministic RBAC contract tests succeed;
3. a production Next.js build succeeds;
4. the existing database contract remains green independently.

Future protected-route and tenant tests must add positive and negative cases, including cross-tenant access denial and insufficient-permission denial.

## Deferred decisions

The following are deliberately deferred rather than faked:

- concrete authentication/session provider;
- organization selection UI;
- invitation/account-linking workflow;
- production email provider;
- production evidence object storage provider;
- background job/event delivery provider.

Those decisions must preserve provider independence where practical and must not weaken the frozen security model.
