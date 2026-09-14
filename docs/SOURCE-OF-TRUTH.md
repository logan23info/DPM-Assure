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

## AI boundary
AI may summarize or interpret source-backed material, but cannot create an authoritative requirement without a source record and human governance.
