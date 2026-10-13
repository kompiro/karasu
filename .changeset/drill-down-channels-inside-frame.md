---
"@karasu-tools/core": patch
"karasu": patch
---

In a drill-down view, edges that go round the first or last row now stay inside the focused container's frame. The channels above the first row and below the last end at the frame's title strip and bottom border instead of at a ghost card outside the frame, and the frame grows when they carry more lanes than its padding holds (#3132).
