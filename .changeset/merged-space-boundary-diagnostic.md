---
"@karasu-tools/core": patch
"karasu": patch
---

`duplicate-boundary-assignment` is now decided on the merged model, so a node
listed in a `boundary` in one file and another `boundary` in a second file is
reported once instead of going silent (#2221). Boundary membership is rebuilt
from the merged declarations rather than unioned per file, so the index and the
diagnostic have one derivation.
