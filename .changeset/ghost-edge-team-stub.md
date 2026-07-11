---
"@karasu-tools/core": patch
"karasu": patch
---

Group-collapse (`groupBy: "team"`) now re-anchors a collapsed member's ghost-system connectors onto its `<Team> (N)` stub. Previously the ghost-edge lists kept referencing the folded member id, so the connector fell back to the surrounding container border instead of the stub (#1874).
