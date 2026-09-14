# Source of Truth

DPM-Assure maintains three explicit truth layers.

## Authority hierarchy
1. Binding legal sources
2. Official standards
3. Regulator guidance
4. Professional/industry guidance
5. DPM-derived methodology

Higher layers govern authoritative compliance claims. Lower layers may explain, operationalize, or test requirements but must not be presented as law.

## Source registry
Every source record should contain:

- `source_id`
- authority
- type
- title
- edition/version
- status
- published date
- effective date
- retirement date
- jurisdiction
- source URL
- last validated date
- validator
- next review date
- license/copyright notes
- intended use

## Requirement provenance
Each requirement must reference its source record plus the precise section/article/control identifier where applicable. Changes to source status or versions create new governed records rather than rewriting history.

## Applicability and obligation operationalization
A DPM obligation rule is **not** an independent legal requirement. It is a versioned system rule that operationalizes an existing source-backed requirement.

The required provenance chain is:

`SOURCE → FRAMEWORK VERSION → REQUIREMENT → OBLIGATION RULE → APPLICABILITY DETERMINATION → OBLIGATION INSTANCE`

Applicability uses validated organization facts and deterministic rule conditions. If required facts are absent or not established, DPM must return `REVIEW_REQUIRED`; it must not infer non-applicability.

A deadline may be materialized only from an `APPLICABLE` determination and a governed trigger/offset stored in the versioned obligation rule. The resulting obligation preserves its source/rule version. Application code and AI must not invent statutory periods or silently override the calculated due date.

## AI boundary
AI may summarize or interpret source-backed material, but cannot create an authoritative requirement, applicability conclusion, obligation rule, or statutory deadline without governed source records and human validation.
