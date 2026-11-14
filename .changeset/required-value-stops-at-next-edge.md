---
"@karasu-tools/core": patch
"karasu": patch
---

A property, edge target or declaration whose value is missing no longer takes the source of the edge on the next line as that value. Inside a node block this used to change the model with no diagnostic. The missing value is now reported where the construct starts, and an edge with no target or a link with no URL is left out of the model (#3767).
