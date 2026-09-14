# Control Library Methodology

## Control classes

Every control is classified as exactly one primary type:

- `LEGAL_REQUIREMENT`
- `REGULATORY_GUIDANCE`
- `STANDARD_REQUIREMENT`
- `AUDIT_CRITERION`
- `IMPLEMENTATION_GUIDANCE`

The classification is not cosmetic: it determines how the item may be represented in reports and how authoritative the statement is.

## Required provenance

A control should carry its source authority, document/version, section/article/control identifier, jurisdiction, applicability, publication/effective/retirement dates, source URL, validation metadata, test procedure, and expected evidence.

## Control design

A useful control record separates:

1. objective
2. authoritative requirement or rationale
3. control statement
4. applicability conditions
5. test procedure
6. expected evidence
7. failure/exception criteria
8. related requirements
9. cross-framework mappings
10. review/version metadata

## Mappings

Mappings are directional relationships. Do not assume two controls are equivalent merely because they overlap. Store relationship type, coverage assessment, rationale, mapping source, reviewer, effective dates, and confidence where appropriate.

## AI assistance

AI may suggest controls or mappings. Suggestions must remain review-pending until validated against authoritative sources and DPM methodology.
