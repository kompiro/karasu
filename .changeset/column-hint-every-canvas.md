---
"@karasu-tools/core": patch
"karasu": patch
---

The `column: left | right` style hint now orders cards on every logical canvas, as ADR-969 and the style spec describe. It used to be applied only where the layering was forced: a canvas holding a user, client, infra or external node, or a group-by view. Elsewhere, such as a system view of plain services or a service's drill-down into its domains, the hint was ignored.
