---
"@karasu-tools/core": patch
"karasu": patch
---

Add a `team-dependencies.krs` feature-samples example that exercises every signal the team-dependency derivation produces: cross-team with sync and async kept apart, a nested pair, an unowned endpoint, and structural overlap in both of its relations. The bundled examples had none of them, so the feature shipped with no model a reader could open to see it. Refs #2597.
