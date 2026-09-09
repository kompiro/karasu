---
"@karasu-tools/core": patch
"karasu": patch
---

Rendering large models is faster: every drill-down level of an export bundle no
longer rebuilds the whole-model indices (resource maps, entity and ghost-endpoint
resolvers), and cross-system endpoint lookups scan only same-named nodes. About
20% off the all-views bundle of a 400-level model; the output is unchanged (#2759).
