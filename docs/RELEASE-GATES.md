# Release Gates

A release is eligible for production only when all applicable gates pass.

- **Repository gate** — source is versioned and reviewable.
- **Schema gate** — migrations are consistent with domain contracts and preserve history.
- **Security gate** — authentication, authorization, sessions, secrets, tenant isolation, and secure defaults are verified.
- **Evidence gate** — hashing, provenance, retention, access control, and chain of custody work.
- **Workflow gate** — state machines, review, sign-off, and freeze rules are enforced server-side.
- **Audit gate** — append-only audit logging captures required context.
- **AI gate** — prompts/models/inputs/outputs are traceable and unsupported conclusions are blocked.
- **Testing gate** — positive and mandatory negative tests pass.
- **Reporting gate** — reports preserve source, methodology, evidence, and decision context.
- **Deployment gate** — production configuration is explicit, reproducible, and provider-independent where practical.
- **Documentation gate** — architecture, rules, schema, and operational procedures match the implementation.

No release gate may be satisfied by a UI claim alone.
