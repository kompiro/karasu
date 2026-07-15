---
"@karasu-tools/core": patch
"karasu": patch
---

Crossing hops now break the host edge's line where they arc, so a hop reads as a real jump-over instead of an arc sitting on top of a continuous line (a "half-moon"). The crossed line stays continuous — it is the through-line the hop jumps over. Part of the #1859/#1939 crossing-marks work.
