---
"@karasu-tools/core": patch
"karasu": patch
---

The `.krs` lexer now reads by code point, so a name with a character outside the BMP is no longer cut short (`from: 𠮷野家` was recorded as `野家`), and combining marks stay in the word they modify (a decomposed `café` was recorded as `cafe`, and Devanagari names split apart) (#2848). `karasu fmt` now prints such names without quotes, since they read back unchanged.
