# Truth Tables

Truth Tables define deterministic product behavior. They are specification artifacts and should be implemented as executable tests where practical.

## Engagement status

| Current | Allowed next states |
|---|---|
| PLANNING | TESTING, CLOSED |
| TESTING | REVIEW, CLOSED |
| REVIEW | CLOSED |
| CLOSED | none |

Any additional transition requires an explicit methodology change.

## AI review state

`GENERATED → AI_REVIEW_PENDING → HUMAN_REVIEW → APPROVED | REJECTED → PUBLISHED`.

Published AI-assisted material remains traceable to the generation and review records.

## Evidence Gate

| Condition | Outcome |
|---|---|
| Required evidence present + integrity valid + applicable + temporally valid | PASS |
| Evidence missing | INSUFFICIENT_EVIDENCE |
| Hash/provenance invalid | FAIL |
| Evidence not applicable | FAIL |
| Evidence outside required period | INSUFFICIENT_EVIDENCE |

## Finding closure

A finding may close only after accepted remediation evidence or an authorized risk-acceptance decision satisfies the applicable closure criteria.

## Freeze

`OPEN → FROZEN` is one-way for the engagement's current version. Post-freeze corrections create controlled superseding versions/events.
