# DPM-Assure Production Readiness Contract

Status: implementation baseline. This document complements, and does not weaken, the Project Constitution, Evidence Gates, Release Gates, Database Security Model, and Schema Freeze.

## 1. Deployment order

1. Back up the production database and verify that the restore path is usable.
2. Apply forward-only SQL migrations using the schema/migration owner credential.
3. Run database contract checks against the migrated schema.
4. Deploy the application using a distinct runtime database role.
5. Run health, authentication, tenant-isolation, authorization, evidence-storage, and critical workflow smoke checks.
6. Promote traffic only after the release gates pass.

Never run the web application with the schema-owner credential. The runtime role must not be a superuser, must not own the protected tenant tables, and must not have `BYPASSRLS`.

## 2. Required environment

See `.env.example`. Secrets must be injected by the deployment platform and must never be committed.

Core runtime variables:

- `DATABASE_URL`
- `APP_BASE_URL`
- `RESEND_API_KEY`
- `AUTH_EMAIL_FROM`
- `OBJECT_STORE_ENDPOINT`
- `OBJECT_STORE_REGION`
- `OBJECT_STORE_FORCE_PATH_STYLE`
- `OBJECT_STORE_ACCESS_KEY_ID`
- `OBJECT_STORE_SECRET_ACCESS_KEY`
- `OBJECT_STORE_BUCKET`
- `OBJECT_STORE_UPLOAD_URL_TTL_SECONDS`
- `OBJECT_STORE_DOWNLOAD_URL_TTL_SECONDS`
- `EVIDENCE_MAX_UPLOAD_BYTES`
- `GROQ_API_KEY`
- `GROQ_MODEL`

## 3. Evidence storage

The evidence bucket/container must be private. Do not expose a public-read policy.

Browser uploads use short-lived signed PUT URLs. The upload intent is not evidence. DPM-Assure retrieves the uploaded object on the server, checks the authorized byte length and content type, computes SHA-256 itself, and only then creates the evidence record and initial custody event.

Downloads use short-lived signed GET URLs only after tenant membership and `evidence.read` authorization. Storage keys are organization- and engagement-scoped and must not be accepted directly from an untrusted client for the governed private-upload flow.

Object-store CORS should allow only the deployed application origin and only the minimum methods/headers needed for signed uploads. Enable provider-side encryption, versioning where supported, access logging, and an explicit retention/lifecycle policy that matches DPM evidence retention requirements. Test restoration of evidence objects as part of disaster-recovery exercises.

## 4. Authentication and abuse controls

Authentication uses opaque magic-link tokens whose persisted values are hashes. Sessions are database-backed and cookies are `HttpOnly`, `Secure`, and `SameSite=Lax`.

Magic-link issuance is throttled with the PostgreSQL-backed `consume_rate_limit` function so limits survive serverless process churn. Email and IP identifiers are one-way hashed before rate-limit storage. Existing, unknown, and rate-limited addresses receive the same generic response to avoid account enumeration.

State-changing `/api/*` requests are protected by a same-origin mutation boundary. Production TLS is mandatory.

## 5. Browser security

The application sends baseline HSTS, CSP, frame, content-type, referrer, permissions, COOP, and CORP headers. Any future third-party script, frame, image, or network dependency must be reviewed before relaxing these policies.

## 6. AI/Groq boundary

Groq is an advisory provider, not Compliance Truth or System Truth. Supported tasks are limited to summarization, evidence extraction, finding drafts, gap analysis, mapping suggestions, and remediation suggestions.

Every generation records the task/source references, prompt version, provider/model, SHA-256 input hash, output, confidence when available, creator, and review state. The assistant is instructed to return `INSUFFICIENT_EVIDENCE` when supplied material is inadequate and is prohibited from inventing legal requirements, evidence, citations, test results, or mappings.

AI output begins at `AI_REVIEW_PENDING`. The creator cannot independently approve the same generation. Only human-approved output may be published. AI has no API capable of audit sign-off, engagement closure, compliance certification, Evidence Gate override, or direct deterministic risk-score mutation.

## 7. Notifications and escalation

In-app notifications are tenant-scoped and addressed to active organization members. Read state is user-specific. Operational services should create notifications in the same authorized tenant transaction as the triggering domain decision wherever atomicity matters.

Existing privacy alert/escalation tables remain the authoritative privacy deadline/escalation mechanism; the general notification inbox is a delivery surface, not a replacement for deterministic due-date or regulatory rules.

## 8. Backups, restore and disaster recovery

Maintain encrypted database backups and object-store recovery/versioning appropriate to the chosen providers. A backup is not considered a control until a restore has been demonstrated.

At minimum, a recovery exercise must prove:

- schema migrations can be applied to the restored database;
- tenant RLS remains enforced under the runtime role;
- append-only/freeze guards remain present;
- evidence objects referenced by restored rows can be retrieved and re-hashed;
- authentication sessions/tokens can be invalidated if compromise is suspected;
- required secrets can be rotated independently.

Document recovery point and recovery time objectives before production launch.

## 9. Observability

Application logs must not contain magic-link tokens, session cookies, invitation tokens, object-store credentials, signed object URLs, Groq API keys, or full sensitive evidence contents. Correlate operational logs using request IDs and domain/audit event identifiers rather than secrets.

Production should have error monitoring, uptime/health monitoring, database/storage capacity alarms, email-delivery failure visibility, and alerts for repeated authorization/rate-limit failures without exposing tenant data.

## 10. Release gate

A release is NO-GO if any required Database Contract, TypeScript Contract, Application Contract, production build, migration determinism check, or security/tenant-isolation test fails. Failures are fixed at the implementation or test-fixture source; controls are not weakened merely to make CI green.

Before public launch, add browser-level end-to-end tests for authentication, role boundaries, cross-tenant denial, the complete assurance lifecycle, client PBC access, private evidence upload/finalization/download, Evidence Gate behavior, audit freeze, and post-freeze immutability.
