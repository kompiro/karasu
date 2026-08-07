---
"@karasu-tools/core": minor
"karasu": minor
---

System-view edges now avoid obstacles in the default (Group by: none) view, not just in the grouped view. Same-layer and upward edges are routed orthogonally, blocked edges detour through an inter-row channel or a side gutter, and no edge is drawn through a node card it does not connect to. Measured over the bundled examples, penetrations in the ungrouped view went from 10 to 0 while the grouped view is unchanged. Refs #2362 (#2330).
