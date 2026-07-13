---
"@karasu-tools/core": minor
"karasu": minor
---

A usecase's bare `resource <id>` now resolves to a unique `entity` of the same
id (the canonical logical form): the resolver follows `usecase → entity → table
→ database` to derive the same `service → database` edge and read/write tags as
a physical dot-notation reference, and a physical and entity-mediated reference
to the same store are no longer double-counted. A bare resource is promoted with
zero edits — its `unassigned-resource` warning disappears — the moment a matching
`entity` is declared anywhere in the model; that warning moved from the parser to
the resolver so the check can span declarations. An ambiguous bare id (>1 matching
entity) stays unresolved and the collision is surfaced by `entity-anchor-collision`.
Refs #1908.
