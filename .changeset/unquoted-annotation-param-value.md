---
"@karasu-tools/core": patch
"karasu": patch
---

An unquoted annotation parameter value is no longer silently corrupted. The lexer used to drop digits, so `@deprecated(until: 2026-12-31)` was recorded as `until: "-"` and `karasu fmt` wrote that back into the file. A value must now be one string literal or one bare word; anything else (`until: 2026-12-31`, `from: system`, `from: Shop.Legacy`) raises the new `annotation-param-value-unreadable` warning and records nothing. The diagram still renders, and `karasu fmt` refuses to rewrite such a file rather than write the value away. Quote the value to fix it: `until: "2026-12-31"`.

The same annotation written twice on one element now warns (`duplicate-annotation`), and giving one parameter two different values warns (`annotation-param-conflict`) and keeps the first, with `fmt` refusing the file rather than printing one value over the other.

Words that start with a digit are no longer dropped elsewhere either. `A -> 2B` is reported instead of becoming an edge to `B`, `[2026]` stays a tag (with `tag-not-builtin`), and `[team-1]`, `@phase-2` and `capability p2p-2` are each read as one name, so `[team-1]` matches the same `.krs.style` selector. See #2707.
