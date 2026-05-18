---
"karasu": minor
---

`domain-dispersal` is now reported at the **info** register, with fact-first wording, per ADR-20260514-02. Previously rendered as a warning ("⚠ domain X is dispersed across multiple services — Check the cohesion of the domain"), it now reads as an informational note ("ℹ Domain X appears under multiple services — DDD sometimes calls cross-service domain reuse a cohesion smell"). Same detection, same params; only the display register and wording change. A new `warningSeverity(kind)` helper is exported from `@karasu-tools/core` so UI consumers can map `WarningKind` to `"warning" | "info"`. `missing-runtime` and `missing-realizes` are also tagged as info severity — preserving their pre-existing ℹ icon in the App, but now exposing the register to consumers other than the App.

Fixes a bug where a `domain` id shared by multiple services within one system also raised the `domain-id-not-unique` **error**, which made the App refuse to draw the diagram. A dispersed domain is a structural fact karasu visualizes, not a defect that blocks rendering — the `domain-id-not-unique` diagnostic code is removed, and the `nodePathIndex` keeps the first occurrence (the same way the migration-coexistence path already picks a winner). The dispersal is still surfaced, now solely through the `domain-dispersal` info diagnostic.
