---
"@karasu-tools/core": minor
"karasu": minor
---

The preview's Facets menu gains **Membership overview** — a panel answering the other half of the question, "which elements belong to facet X", with each facet's description, policy links and member list.

The list is derived from the `facets` properties on every compile, never authored: writing membership element-side is what keeps a rename from meaning an edit to a distant list, and deriving the centralized view is how that trade-off is paid without giving it up. Two same-named elements in different scopes appear as two rows, told apart by their path.

`getReference`'s neighbour on the core API: `buildFacetOverview(file)` and `SystemCompileResult.facetOverview` expose the same derivation to any consumer.

Also adds `feature-samples/tag-facet-registers.krs`, which puts all four vocabulary registers — tag (archetype), annotation (lifecycle), facet (external membership), boundary (view grouping) — on one diagram, with a companion sheet showing the selector that belongs to each.

`facet` remains **experimental** notation (`.krs language v1.0` unchanged).
