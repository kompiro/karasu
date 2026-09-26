---
"@karasu-tools/core": patch
"karasu": patch
---

Draw every derived edge on the root view, not just the declared ones

A root view with more than one system, and the `Unassigned` root that a model
with no `system` block gets, drew only the dependencies written as an explicit
arrow. The same dependency expressed the way the spec recommends — through a
`usecase`'s `resource` reference, a `delivers` declaration, or cross-service
domain edges — rendered as disconnected boxes, and a collapsed `Infra` layer
showed a stub with nothing pointing at it.

Each system frame now draws the edges derived from its own children, so those
dependencies appear wherever the system sits. Compare mode keeps a removed
derived edge visible and marks it on the system that lost it. Drill-down and
single-system views are unchanged.
