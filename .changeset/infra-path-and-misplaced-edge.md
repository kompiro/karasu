---
"@karasu-tools/core": patch
"karasu": patch
"karasu-skills": patch
---

An edge written in a block that takes no edges (`boundary`, `organization`, `team`, `member`, `facet`, `deploy` and its units, `legend`, `capability`, an edge's property block) is now read whole and reported once, instead of once per token. An edge with a property block no longer closes the enclosing block early. A `table` mapping or `resource` reference that goes past the leaf of `<Infra>.<Leaf>` (a third segment, or a dot after the leaf) now raises one `infra-path-too-long` error instead of a run of unexpected-token errors, and a trailing dot no longer takes the source of an edge on the next line (#3499).
