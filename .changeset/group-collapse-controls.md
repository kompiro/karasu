---
"@karasu-tools/core": minor
"karasu": minor
---

Draw an interactive ⊖/⊕ collapse control on each system-view team boundary frame (Issue #1858, P2a). In `groupBy: "team"` live preview (`interactive: true`), clicking a group's ⊖ folds it to a `<Team> (N)` stub (⊕ to expand) via `data-collapse-group`. Static outputs stay clean. `ContainerRect` gains an optional `groupId`.
