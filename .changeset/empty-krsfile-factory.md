---
"@karasu-tools/core": minor
"karasu": minor
---

Export `createEmptyKrsFile()` from `@karasu-tools/core` — a factory returning a fresh, empty `KrsFile` literal on every call. This replaces three independent copies of the same 17-field empty-object literal across the parser, the import resolver, and the CLI's `subtree` command. The copies were identical, but each duplicate was a distinct opportunity for the defaults to silently diverge as `KrsFile` gains fields: the compiler forces every copy to have the right shape, but not the right default values. Centralizing the literal in one factory removes that risk. No `.krs` / `.krs.style` parsing or rendering behavior changes.
