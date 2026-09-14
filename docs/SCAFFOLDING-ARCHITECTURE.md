# Scaffolding Architecture

## Target stack

- Next.js + TypeScript
- Tailwind CSS + shadcn/ui
- Drizzle ORM
- PostgreSQL
- Secure session-based authentication
- Provider-neutral object storage for evidence
- Provider-neutral email and background jobs
- Groq behind an AI provider abstraction

## Application boundaries

`src/domain` contains domain types, invariants, rules, and services.

`src/application` coordinates use cases and authorization-aware commands/queries.

`src/infrastructure` contains database, storage, email, jobs, AI-provider, and external adapters.

`src/app` contains Next.js routes and UI composition; it must not become the source of domain truth.

## Security boundary

Authentication establishes the principal. Authorization resolves organization membership and permissions server-side. Domain/application services enforce ownership and workflow rules before persistence.

## Persistence boundary

Database constraints complement application rules. Historical records use versioning/event patterns where mutation would destroy audit integrity. Organization identifiers are mandatory on organization-owned aggregates.

## AI boundary

The AI adapter receives explicit source references and returns traceable assistance objects. It cannot directly write an approved audit conclusion or sign-off.
