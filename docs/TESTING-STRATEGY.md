# Testing Strategy

Testing is part of the assurance design, not a final polish step.

## Required layers

- unit tests for domain rules and scoring
- integration tests for database constraints and service boundaries
- authorization and tenant-isolation tests
- API contract tests
- workflow/state-transition tests
- evidence integrity tests
- AI traceability and insufficient-evidence tests
- end-to-end tests for critical assurance paths

## Mandatory negative tests

- unauthenticated protected request
- cross-tenant read/write attempt
- unauthorized role action
- segregation-of-duties violation
- invalid state transition
- missing required evidence
- invalid evidence hash/provenance
- unsupported AI conclusion
- finding closure without required basis
- post-freeze mutation
- audit-log modification/deletion

## Release evidence

Every release should record test execution, failures, accepted exceptions, and the version of the rules/schema against which the tests ran.
