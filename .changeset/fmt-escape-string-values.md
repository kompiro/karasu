---
"@karasu-tools/core": patch
"karasu": patch
---

Escape embedded quotes, backslashes and newlines in emitted string values. `karasu fmt` previously wrote `label "say "hi""` for a label containing a quote, producing a file that no longer parses; `karasu translate --from openapi` emitted an unparseable model when an operation `summary` contained `"""`. Values now round-trip through both commands, and a description containing `"""` falls back to the single-line form. Closes #2087; see ADR-2087.
