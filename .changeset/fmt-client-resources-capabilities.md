---
"@karasu-tools/core": patch
"karasu": patch
---

`karasu fmt` and format-on-save no longer delete a client's `resource` and `capability` lines. Both forms of `capability` (bare, and the block with `label` / `description`) are kept (#3101).
