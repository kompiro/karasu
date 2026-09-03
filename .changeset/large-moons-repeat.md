---
"@karasu-tools/core": minor
"karasu": minor
---

Edges can belong to a `facet`. `A -> B { facets pii }` is accepted in the edge property block, spelled and merged exactly as on a node, and it does something: the edge lights up in the facet overlay, `edge[facets=pii]` in a `.krs.style` sheet matches it, `facet-not-declared` catches a typo on the merged model, and it appears in the membership overview. A derived edge takes the union of what it folds — an aggregated `"N domain edges"` and a collapsed group's stub edge both belong to every facet their constituents do. Writing the property changes nothing until a reader selects that facet. Closes #2544 (slice B of #2209).
