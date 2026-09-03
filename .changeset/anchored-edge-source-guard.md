---
"@karasu-tools/core": patch
"karasu": patch
---

Stop drawing an edge whose source is not the block that declares it. An explicit
edge inside a `service` / `domain` / `entity` block must start at that block
(`edge-source-mismatch`); the rejected declaration is now drawn on no view —
including the entity view, where the same rule is what fixes a relation's
direction — so the error is the only signal. Edges in blocks that carry no
origin-scope rule (`client`, `database`, `queue`, `storage`) are unchanged.
