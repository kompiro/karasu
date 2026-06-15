---
"karasu": minor
---

Lifecycle annotations can now carry migration-intent parameters: `@deprecated(until: "2026-Q3")` / `@experimental(until: …)` and `@migration_target(from: …)`. Values follow graceful degradation — a date / year-month / quarter is machine-usable, any other string is kept verbatim (display-only). An unrecognized key or a parameter on another annotation is dropped with an `annotation-param-unsupported` warning; custom annotations stay parameter-less. The annotation name list (and `.krs.style` selectors / inheritance) is unaffected. See ADR-20260615-02.
