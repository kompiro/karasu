---
"@karasu-tools/core": minor
"karasu": minor
---

Edges now stop on the shape that is drawn, not on its bounding box. A `user` card's arrowhead no longer lands in the empty corner beside the medallion, a cylinder's no longer floats above the rim, and a cloud's reaches the blob instead of the box above it. Shapes declare this themselves — which parts of each side their outline covers, and how far in it sits — so a new shape brings its own attachment rule.

The card's own chrome (the corner lane of #2420, the boundary tabs of #2179) keeps ports out of the way where an edge has a bend that can absorb the move; a straight edge stays straight. Diagrams built only from rectangles are unchanged. Issue #2422.
