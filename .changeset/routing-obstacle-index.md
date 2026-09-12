---
"@karasu-tools/core": patch
"karasu": patch
---

Rendering dense diagrams is faster: the routing chain now asks a spatial index for the obstacles near a candidate route instead of testing every card and frame on the canvas. Output is unchanged (#2790).
