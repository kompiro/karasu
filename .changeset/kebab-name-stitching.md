---
"@karasu-tools/core": patch
"karasu": patch
---

Hyphenated vocabulary names now lex as one name. `[my-team-internal-tag]` parses as a single tag instead of seven silent fragments, and the same kebab-case rule applies to annotation names (`@my-mark`), legend `ref` targets, and (as before) `capability` names — all through one shared helper. A kebab-case tag written in `.krs` now matches the same spelling in a `.krs.style` selector, and `tag-not-builtin` reports the name the author actually wrote. (#2509)
