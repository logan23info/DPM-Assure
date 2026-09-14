# Rules Catalog

Rules are deterministic product decisions. Each rule must have an identifier, purpose, inputs, decision, owner, version, effective date, and tests.

## Initial rules

- `AUTHZ-001` — protected operations require an authenticated principal.
- `TENANT-001` — organization-owned records must be scoped to the caller's authorized organization.
- `SOD-001` — incompatible preparation/review/sign-off roles are blocked where segregation of duties applies.
- `ENG-001` — engagement transitions must match the Engagement Truth Table.
- `EVID-001` — test conclusions require a passing Evidence Gate or an explicitly governed insufficient-evidence outcome.
- `AI-001` — unsupported AI conclusions must be represented as `INSUFFICIENT_EVIDENCE`.
- `AI-002` — AI cannot perform audit sign-off.
- `AUDIT-001` — audit history is append-only.
- `FREEZE-001` — frozen audit records cannot be silently mutated.
- `RISK-001` — risk scores are calculated deterministically and remain explainable.
- `MAP-001` — cross-framework mappings require an explicit relationship and rationale.

Rules are not legal requirements. They define DPM-Assure behavior.
