---
"@karasu-tools/core": minor
"karasu": minor
---

Add `karasu coverage` and `karasu subtree` CLI commands (and the core
`extractCoverage` API). `coverage` reports per-domain density (usecases /
entities / resources / edges) over a resolved `.krs` model and flags thinly-modeled
domains; `subtree` extracts one node's sub-tree as standalone `.krs`. These are the
structural primitives for the architecture-reverse workflow (#1895).
