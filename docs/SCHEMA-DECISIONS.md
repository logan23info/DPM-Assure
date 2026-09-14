# Schema Decisions

## Status

**Schema freeze candidate — Foundation milestone.**

The canonical database model is documented in `DATABASE-SCHEMA.md`. Before application scaffolding, implementation migrations must reproduce this model with explicit PostgreSQL enums/check constraints, foreign keys, unique indexes, tenant indexes, timestamps, and append-only protections.

## Naming contract

Use one canonical name per concept across database, domain, API, and UI. In particular:

- engagement display name: `name`, not `title`
- workpaper version actor: `changed_by`
- workpaper version timestamp: `changed_at`
- sign-off reviewer: `reviewed_by`
- audit actor: `actor_user_id`

No endpoint may introduce legacy aliases without an explicit compatibility decision.

## Tenant contract

Organization ownership is resolved from the authenticated session and membership. The client cannot select an arbitrary organization by request header and cannot impersonate another user.

## Historical contract

Records that form evidence of an audit decision are versioned or event-recorded rather than overwritten. Frozen engagements are protected by application and database controls.

## Next implementation artifact

Create the Drizzle PostgreSQL migration only after this specification and the domain truth tables are reviewed together. The migration should be treated as a versioned contract and never edited destructively after deployment.
