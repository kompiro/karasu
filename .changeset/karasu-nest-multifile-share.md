---
"@karasu-tools/core": minor
"karasu": minor
---

Add `synthesizeSharePayload` / `serializeKrsFile` to flatten a multi-file `.krs`
project (resolving `import`s and merging styles) into a single self-contained
`.krs` + `.krs.style`. Powers karasu-nest inline sharing of multi-file projects.
