---
"@karasu-tools/core": patch
"karasu": patch
---

An unquoted annotation parameter value is no longer silently corrupted. The lexer used to drop digits, so `@deprecated(until: 2026-12-31)` was recorded as `until: "-"` and `karasu fmt` wrote that back into the file. A value must now be one string literal or one bare word; anything else (`until: 2026-12-31`, `from: system`, `from: Shop.Legacy`) raises the new `annotation-param-value-unreadable` error, records nothing, and makes `karasu fmt` leave the file unchanged. Quote the value to fix it: `until: "2026-12-31"`.

The same annotation written twice on one element now warns (`duplicate-annotation`), and giving one parameter two different values is an error (`annotation-param-conflict`) that keeps the first value, so `fmt` no longer prints the second value over the first.

Words that start with a digit are no longer dropped elsewhere either. `A -> 2B` is reported instead of becoming an edge to `B`, `[2026]` stays a tag (with `tag-not-builtin`), and `[team-1]`, `@phase-2` and `capability p2p-2` are each read as one name, so `[team-1]` matches the same `.krs.style` selector. See #2707.
