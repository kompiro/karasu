---
"@karasu-tools/core": patch
"karasu": patch
---

Crossing hops, merge count chips and trunk bands now dim with their edges when the preview focuses a node or an edge is hovered. Each mark names the edges it belongs to in `data-edges`, those edges carry a matching `data-edge-index`, and a hop `<path>` now holds the hops of a single edge. Trunk bands keep their 0.4 as `stroke-opacity`, so they look the same.
