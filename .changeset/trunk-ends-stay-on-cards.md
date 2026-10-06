---
"@karasu-tools/core": patch
"karasu": patch
---

Fix trunked edges ending away from their card in Group-by views. When a left gutter lane shifted the canvas, the shared end of a fan-in or fan-out trunk moved once per sibling instead of once, so its arrows stopped short of the node (#2966).
