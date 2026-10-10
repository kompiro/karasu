---
"karasu": patch
---

`karasu render`, `check`, `matrix`, `coverage`, `team-dependencies` and `subtree` accept a directory and use its `index.krs` as the entry, as `serve` does. Diagnostics name `<dir>/index.krs:<line>:<column>`, and a directory without an `index.krs` is reported as such instead of as "File not found" (#2942).
