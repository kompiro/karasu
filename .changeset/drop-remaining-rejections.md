---
"@karasu-tools/core": patch
"karasu": patch
---

More misplaced constructs now raise a single error, and everything after them parses unchanged (#3463). This covers a node declared inside a `boundary` block, an infra block or a sub-resource body, `role` / `handles` / `operations` / `delivers` written there, `table` on a kind other than `entity`, and a dotted path after `delivers`. Previously each of these cascaded into one error per token, and a `database` inside a `boundary` closed the boundary early.
