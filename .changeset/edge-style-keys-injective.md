---
"@karasu-tools/core": patch
"karasu": patch
---

Two edges whose quoted endpoints join to the same text, such as `a -> "b->c"` and `"a->b" -> c`, now keep their own resolved style and `direction`. Before, the edge declared later won: a rule on it colored both edges, and a rule on the other one colored neither. A `direction` behaved the same way. Ordinary edges are unchanged (#3481).
