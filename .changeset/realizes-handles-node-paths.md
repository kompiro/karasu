---
"@karasu-tools/core": minor
"karasu": minor
---

`realizes` and `handles` accept node reference paths (`realizes Shop.Api`, `handles Backend.Order`), resolved by the shared suffix rule (#2088 slice C, #2549). A rejected form (dangling dot) now reports once and records nothing — previously `realizes Shop.Api` silently recorded `realizes Shop` next to a cascade of errors. The `handles` one-hop expose rule is evaluated against the resolved domain rather than the reference text, and the new `realizes-target-ambiguous` / `handles-target-ambiguous` warnings list candidate full paths for mixed-kind/depth multi-matches.
