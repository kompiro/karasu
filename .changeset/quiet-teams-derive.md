---
"@karasu-tools/core": minor
"karasu": minor
---

Derive team-to-team dependencies from `owns` × the logical edges, and read them from the CLI with `karasu team-dependencies` (md matrix + provenance, or csv). No `.krs` syntax changes: a node with no `owns` of its own now resolves to its nearest owned ancestor's team, co-owned nodes keep every owner, sync and async stay separate, and endpoints that reach no team are reported rather than dropped. Slice A of #2597 (#2635).
