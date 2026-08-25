---
"@karasu-tools/core": minor
"karasu": minor
---

`realizes` and `handles` accept node reference paths (`realizes Shop.Api`, `handles Backend.Order`), resolved by the shared suffix rule (#2088 slice C, #2549). A rejected form (dangling dot) now reports once and records nothing at these sites — previously `realizes Shop.` silently recorded `realizes Shop` next to a cascade of errors — and the report's range covers the dot. The `handles` one-hop expose rule is evaluated against the resolved domain rather than the reference text, `unresolved-handles` now anchors on the reference that failed rather than on the declaring node, and `karasu fmt` prints `handles` instead of deleting the line. The new `realizes-target-ambiguous` warning lists candidate full paths for mixed-kind/depth multi-matches; `handles` has no ambiguity code, since every candidate the expose rule can reach is a `domain` at the same depth. In the deploy view, a qualified `realizes` now narrows the container it groups into, so two systems' same-named services no longer merge under one (id-collision containers are addressed by their qualified path).
