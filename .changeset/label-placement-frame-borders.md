---
"@karasu-tools/core": patch
"karasu": patch
---

Edge labels nudged off a collision no longer land on or across the border of a frame (the drill-down frame, team and boundary group frames). A label stays on the side of every frame border its default position is on; under `label-display: auto` a label with no clear spot on that side is left off the canvas instead (#3155).
