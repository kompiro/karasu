---
"@karasu-tools/core": patch
"karasu": patch
---

An edge whose quoted source starts the line after another edge or a `link` is no longer read as that edge's or link's label. At system scope both edges are now kept, where the second one used to be lost with errors. Inside a node block, such a line used to give the previous edge a label and an extra edge with no diagnostic; it is now read as written, and reports `edge-source-mismatch` when its source is not that node (#3752).
