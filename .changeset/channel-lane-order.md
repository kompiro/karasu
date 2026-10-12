---
"@karasu-tools/core": patch
"karasu": patch
---

Two gutter routes that only touched in an inter-row channel could be drawn overlapping by one lane pitch, reading as a single line. The channel's lanes are now stacked so a run that carries on upwards sits above one that carries on downwards from the same column (#3088). Diagrams that were already correct render byte-identically.
