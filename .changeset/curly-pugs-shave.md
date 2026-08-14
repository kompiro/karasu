---
"@karasu-tools/core": patch
"karasu": patch
---

Keep parallel edges apart when both endpoints are services expanded in place. The bundling pass now separates any edge still drawn on a sibling's line instead of only ghost and cyclic edges, so a `S1 -> S2` / `S1 --> S2` pair no longer collapses into one arrow (#2477, ADR-2477).
