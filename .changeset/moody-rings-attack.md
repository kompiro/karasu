---
"@karasu-tools/core": minor
"karasu": minor
---

Group by: Boundary now places shared members deliberately (#2176). Boundaries that share a node are banded next to each other where the dependency flow allows it, the shared node is seated on the row of its band that touches the other boundary's band, and a boundary whose members are all claimed by earlier ones takes one of its shared members so it gets a frame instead of vanishing. The band stack is still a minimum feedback-arc-set first and models with no shared members lay out exactly as before.
