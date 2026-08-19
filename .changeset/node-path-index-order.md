---
"@karasu-tools/core": patch
"karasu": patch
---

`node-id-multiple-locations` no longer depends on declaration order (#2550): the verdict is decided after the whole model is walked, cross-kind collisions (including top-level infra / client blocks) are reported instead of silently overwriting `nodePathIndex`, and the index keeps the `@migration_target`-priority winner (ties keep the first declaration). Domain-vs-domain multiplicity stays silent (`domain-dispersal`). Fixes deep permalinks / viewPath silently resolving to the wrong node.
