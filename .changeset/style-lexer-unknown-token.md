---
"@karasu-tools/core": patch
"karasu": patch
---

`.krs.style` sheets now read names with the same characters as `.krs` files, so a selector for a non-ASCII id, tag or facet (`#注文`, `[facets=個人情報]`) matches. A `-` that starts no number or arrow, or a non-ASCII character that starts no name, is now reported instead of being dropped, so `label-offset: - 20px` is refused rather than applied as `20px` (#3140).
