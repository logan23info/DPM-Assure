# Evidence Gates

Evidence Gates prevent unsupported assurance conclusions.

## Gate dimensions

1. **Identity** — evidence is linked to the intended workpaper/procedure/control.
2. **Provenance** — uploader/source and acquisition context are known.
3. **Integrity** — stored hash matches the recorded cryptographic digest.
4. **Authorization** — access and handling are permitted.
5. **Applicability** — evidence addresses the claimed control/test.
6. **Temporal validity** — evidence covers the required period.
7. **Completeness** — required evidence set is satisfied or explicitly marked insufficient.
8. **Chain of custody** — material changes and transfers are recorded.

## Outcomes

`PASS`, `FAIL`, or `INSUFFICIENT_EVIDENCE`.

A failed or insufficient gate must not be converted into a positive conclusion merely through UI action. Human review may record a qualified conclusion only where the methodology explicitly permits it and the basis is preserved.
