---
"@karasu-tools/core": minor
"karasu": minor
---

Group-by views now bundle the edges that leave one service for gutter-routed targets onto one spine that leaves the source once and branches at each target's row. The count at each split goes down as siblings leave, and the band thins with it, the mirror of the fan-in trunk (#2883). The canvas gets narrower and fewer lines cross. A fan-in trunk whose target sits above its sources no longer puts a "1" on its lowest corner (#2885).
