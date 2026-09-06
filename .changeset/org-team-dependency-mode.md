---
"@karasu-tools/core": minor
"karasu": minor
---

Draw the derived team dependencies on the org tab as a third mode, beside the grid and Tree View (#2636). Solid arrows are `sync` dependencies and dashed ones `async`; a muted arrow is a pair where one team sits inside the other in the org tree. Endpoints that resolve to no team are counted in the footer rather than omitted, and the mode is offered only when the model declares an `organization`. Slice B of #2597.
