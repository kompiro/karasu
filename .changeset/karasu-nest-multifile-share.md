---
"@karasu-tools/core": minor
"karasu": minor
---

Add `synthesizeSharePayload` / `serializeKrsFile` to flatten a multi-file `.krs`
project (resolving `import`s and merging styles) into a single self-contained
`.krs` + `.krs.style`. Powers karasu-nest inline sharing of multi-file projects.

Also fixes `serializeStyleSheet` dropping `edge[from=<id>]` / `edge[to=<id>]`
endpoint predicates (#1755) — they collapsed to a universal `edge` selector,
which lost source/target edge colors and merged distinct rules (affected Tidy
and share).
