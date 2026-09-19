---
"@karasu-tools/core": patch
"karasu": patch
---

Deploy view: when two systems declare a same-named service and infra, each system's `service → infra` dependency edge is now drawn between its own containers instead of the second one being dropped, and an edge no longer lands on another system's same-named container when the system's own node is not deployed (#2817).
