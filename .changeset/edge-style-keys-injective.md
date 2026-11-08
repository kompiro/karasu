---
"@karasu-tools/core": patch
"karasu": patch
---

Two edges whose quoted endpoints join to the same text, such as `a -> "b->c"` and `"a->b" -> c`, now keep their own resolved style and `direction`. Before, the later one's style was drawn on both, so a rule on `"a->b" -> c` colored both edges and a rule on `a -> "b->c"` colored neither. Ordinary edges are unchanged (#3481).
