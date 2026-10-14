---
"@karasu-tools/core": patch
"karasu": patch
---

Every drawn edge now carries the wide transparent hit-line, not only edges with a canonical id or a property block, so deploy-view edges, ghost edges and edges whose id was cleared by a base collision can be hovered and followed like any other (#2632). Exported SVGs grow by the hit-lines (about +0.65% on the examples corpus) and look the same. The `krs-edge--interactive` class still marks only the edges the direction menu can address.
