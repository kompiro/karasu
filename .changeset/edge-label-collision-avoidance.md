---
"@karasu-tools/core": patch
"karasu": patch
---

Auto collision-avoidance for edge labels (#2048): edge labels that would overlap a node card or another label are now nudged off the collision in a bounded, deterministic layout post-pass. Diagrams with no label collisions render byte-identically, and author-set `label-position` / `label-offset` still win.
