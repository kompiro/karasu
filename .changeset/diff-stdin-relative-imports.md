---
"karasu": patch
---

`karasu diff` now resolves relative imports in a stdin side (`-`) against the other side's directory, so `git show HEAD~1:docs/system.krs | karasu diff - docs/system.krs` finds the files the revision imports (#3122).
