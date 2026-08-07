---
"@karasu-tools/core": minor
"karasu": minor
---

The multi-system root view now routes its edges instead of drawing them as straight lines. Edges avoid the cards between their endpoints, fan out across ports, get lane separation, and crossings are marked with hop arcs — the same treatment a single-system view already had. This also reaches the grouped root view, which previously drew bands and frames but left every edge straight. Refs #2363 (#2330).
