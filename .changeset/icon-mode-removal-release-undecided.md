---
"@karasu-tools/core": patch
"karasu": patch
---

Correction to the 0.3.0 (core) / 0.7.0 (CLI) release notes: **icon display
mode is still deprecated, but it will not necessarily be removed in the next
major version.** It will be removed in a future major; which release is not
decided yet. Moving to shape mode with `shape: url(...)` remains the
recommended path (ADR-2906, superseding ADR-2376).
