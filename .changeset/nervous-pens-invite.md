---
"@karasu-tools/core": patch
"karasu": patch
---

Edge labels no longer sit on top of another edge's line. The label placement pass now treats every drawn edge polyline as an obstacle (a label's own line is exempt), so text and stroke stop being drawn over each other. Measured across `examples/en`: 49 labels on a foreign line → 0. Diagrams with no collision are unchanged. See [#2360](https://github.com/kompiro/karasu/issues/2360) / ADR-2360.
