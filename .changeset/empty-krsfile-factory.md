---
"@karasu-tools/core": minor
"karasu": minor
---

Export `createEmptyKrsFile()` from `@karasu-tools/core` — a factory returning a fresh, empty `KrsFile` literal on every call. This replaces three independent copies of the same 18-field empty-object literal that had drifted apart across the parser, the import resolver, and the CLI's `subtree` command, removing the risk of the defaults silently diverging as `KrsFile` grows fields. No `.krs` / `.krs.style` parsing or rendering behavior changes.
