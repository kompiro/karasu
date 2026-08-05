---
"@karasu-tools/core": minor
"karasu": minor
---

`getReference()` now carries a `groupingConstructs` catalog, so `boundary` and `facet` are reachable from the Reference surface (they were shipped, spec'd, and absent from it — #2316). Each entry says how membership is written, which is what the `facets` property listed on every node kind actually points at.

Entries carry an `experimental` flag rather than being hidden: experimental notation is listed so it can be found, and flagged so being listed does not read as a stability promise (ADR-2316). The Syntax tab gains a matching `import` / `@import` section and an `experimental?` marker on `SyntaxSection`.

No change to the `.krs` language — this is a TypeScript API addition only.
