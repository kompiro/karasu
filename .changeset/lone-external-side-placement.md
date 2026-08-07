---
"@karasu-tools/core": patch
"karasu": patch
---

Place a lone `[external]` service on the side its consumers are on. When only one external was auto-assigned (or several shared the same consuming hubs), the median split collapsed onto that value and the "ties go left" rule sent every one of them to the left column regardless of where the calling services sat, so edges crossed the whole diagram. The degenerate case now compares the consuming-hub barycenter against the content centre instead. Fixes #2384, refines [ADR-1728](https://github.com/kompiro/karasu/blob/main/docs/adr/1728-external-on-sides-layout.md).
