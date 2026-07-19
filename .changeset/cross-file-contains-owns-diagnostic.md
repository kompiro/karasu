---
"@karasu-tools/core": patch
"karasu": patch
---

Fix false `contains-target-not-found` / `owns-target-not-found` warnings in
project (multi-file) mode. A `boundary … contains` member or a `team … owns`
target declared in an imported file no longer warns — reference existence is now
validated against the merged id-space instead of per file. Genuinely missing ids
still warn. (#2032)
