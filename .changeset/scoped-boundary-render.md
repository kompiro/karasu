---
"@karasu-tools/core": minor
"karasu": minor
---

Scoped `boundary` blocks now draw their frames. Under *Group by: boundary*, a `boundary` declared inside a node block frames that node's canvas — the service's drill-down view, the domain's usecase or entity view, an infra block's leaf view — and appears nowhere else. Top-level `boundary` blocks keep their model-wide reach unchanged; where both name the same node, the scoped block wins, being the more specific declaration.

The axis reaches every render surface: interactive compile, the drill-down and all-layers bundles, the entity view and diff mode.
