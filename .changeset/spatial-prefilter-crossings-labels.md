---
"@karasu-tools/core": patch
"karasu": patch
---

Rendering dense views is faster: the crossing-mark pass and the edge-label placement pass look up nearby segments and rects through a spatial index instead of testing every pair, so a big canvas (hundreds of edges) no longer spends most of its render time in those two passes. The output is unchanged: the same crossing marks and the same label positions, byte for byte (#2760).
