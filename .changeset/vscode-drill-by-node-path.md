---
"karasu-vscode": patch
---

Preview drill-down and the detail panel resolve the clicked card by its
`data-node-path` (#2917): with two same-named services in different systems,
clicking the card inside `Admin` now drills into `Admin` and shows `Admin`'s
metadata, instead of the bare-id winner. Cards without a path behave as before.
