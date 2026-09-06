---
"@karasu-tools/core": minor
"karasu": minor
---

Route the deploy view's container edges through the shared routing chain
(#2609). Edges into one container now fan out along its side instead of all
ending at one point, and an edge detours around a container that sits between
its endpoints instead of piercing it. In-place expansion no longer switches on
Group-by trunk aggregation, so two parallel edges into an expanded service keep
their own corridor and anchor (#2490).
