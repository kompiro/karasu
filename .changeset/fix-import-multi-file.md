---
"karasu": patch
---

Fix multi-file import: splitting one `system` across files via `import "p.krs"` now merges cleanly. The resolver no longer warns on DAG re-arrival, no longer drops content on the second visit to an already-touched file, unions same-id `deploy` / `organization` blocks, and emits a `system-property-conflict` warning instead of silently overwriting `label` / `description`. See `docs/spec/syntax.md` §"Multi-file import semantics" for the full rules.
