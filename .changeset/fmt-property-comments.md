---
"@karasu-tools/core": patch
"karasu": patch
---

`karasu fmt` and format-on-save keep a comment next to the property line it annotates (`label`, `link`, `description`, `capability`, `runtime`, `owns`, …) instead of moving it to the end of the file. Comments at the end of a block body, after a closing brace, and inside an empty block also stay where they were written (#3263).
