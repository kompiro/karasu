---
"@karasu-tools/core": patch
"karasu": patch
---

Multi-file imports no longer merge away edges that only share their endpoints. A `->` and a `-->` over the same pair, or two edges with different labels, now both survive a `system` reopen and a named import, matching the `(from, to, kind, label)` dedup identity in `docs/spec/syntax.md` (#2780).
